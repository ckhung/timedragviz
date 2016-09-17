/* global console, d3, queue */

var G = {
  filename: {
    config: 'config.json',
    regions: 'regions.csv',
    data: 'data.csv'
  },
  domain: {},
  scale: {}
}; // global variables

d3.select('#region-file').text(G.filename.regions);
d3.select('#data-file').text(G.filename.data);
queue()
  .defer(d3.json, G.filename.config)
  .defer(d3.csv, G.filename.regions)
  .defer(d3.csv, G.filename.data)
  .awaitAll(init);

function organizeData(data) {
  G.fieldName = data[0].startval.fieldName;
  // field name for "region", field name for "time"
  var idFN = G.fieldName['region'], timeFN = G.fieldName['time'];
  G.region = {};
  data[2].forEach(function (d) {
    if (! (d[idFN] in G.region)) {
      G.region[d[idFN]] = {};
    }
    G.region[d[idFN]][d[timeFN]] = d;
  });
  data[1].forEach(function (d) {
    var time, k;
    for (time in G.region[d[idFN]]) {
      for (k in d) {
	G.region[d[idFN]][time][k] = d[k];
      }
    }
  });
}

function init(error, data) {
  /******************* received input data files *******************/
  if (error) { return console.warn(error); }

  organizeData(data);
  console.log(G);

/*
  var regionFieldNames = Object.keys(G.region).filter(function (d) {
    return d != G.fieldName['region'] && d != G.fieldName['time'];
  });
  d3.select('#region-field-names')
    .data(regionFieldNames)
    .enter()
    .append('span')
    .attr('class', 'label label-primary')
    .text(function (d) { return d; });
*/

  d3.select('#region-field').property('value', G.fieldName['region']);
  d3.select('#time-field').property('value', G.fieldName['time']);

  G.sample = { region: Object.keys(G.region)[0] };
  G.sample.time = Object.keys(G.region[G.sample.region])[0];
  G.sample.data = G.region[G.sample.region][G.sample.time];
  var dataFieldNames = Object.keys(G.sample.data).filter(function (d) {
    return d != G.fieldName['region'] && d != G.fieldName['time'];
  });
  d3.select('#data-field-names')
    .selectAll('button')
    .data(dataFieldNames)
    .enter()
    .append('button')
    .attr('class', 'pure-secondary')
    .text(function(d) { return d; });

  G.timeSlider = d3.slider().axis(true).min(2003).max(2014)
    .step(1).value(2014).on('slide', toTime);
  d3.select('#time-slider').call(G.timeSlider);
  d3.select('#time-text').text(2014);

  var gpzoom = d3.behavior.zoom()
    .scaleExtent([0.2, 8])
    .on('zoom', function () {
      d3.select('#viz-canvas').attr('transform', 'translate(' +
        d3.event.translate + ')scale(' + d3.event.scale + ')');
    });

  // http://bl.ocks.org/cpdean/7a71e687dd5a80f6fd57
  // https://stackoverflow.com/questions/16265123/resize-svg-when-window-is-resized-in-d3-js
  d3.select('#viz-pane')
    .append('svg')
    .attr('preserveAspectRatio', 'xMinYMin meet')
    .attr('viewBox', '0 0 800 600')
    .classed('rsvg-content', true)
    .call(gpzoom)
    .append('g')
    .attr('id', 'viz-canvas');

  var canvas = d3.select('#viz-canvas');
  // http://stackoverflow.com/questions/9589768/using-an-associative-array-as-data-for-d3
  var regions = canvas.selectAll('.region').data(d3.entries(G.region));
  regions.exit().remove();
  regions.enter()
    .append('circle')
    .classed('region', true)
    .append('svg:title')
    .classed('tooltip', true);

  // https://stackoverflow.com/questions/16919280/how-to-update-axis-using-d3-js
  canvas.append('g').attr('id', 'xAxis');
  canvas.append('g').attr('id', 'yAxis');

  recalc();
}

function recalc() {
  var values, v;
  ['xAxis', 'yAxis', 'width'].forEach(function(k) {
    values = Object.keys(G.region).map(function(r) {
      v = Object.keys(G.region[r]).map(function(t) {
	return parseFloat(G.region[r][t][G.fieldName[k]]);
      });
      return { max:d3.max(v), min:d3.min(v) };
    });
    G.domain[k] = {
      max: d3.max(values.map(function(v){ return v.max; })),
      min: d3.min(values.map(function(v){ return v.min; }))
    };
  });

  // https://stackoverflow.com/questions/16265123/resize-svg-when-window-is-resized-in-d3-js
  var viewBox = d3.select('#viz-pane svg')
    .attr('viewBox').split(' ').map(parseFloat);
  var width = viewBox[2], height = viewBox[3];

  G.scale.xAxis = d3.scale.linear()
    .range([width * 0.2, width * 0.8])
    .domain([G.domain.xAxis.min, G.domain.xAxis.max]);
  G.scale.yAxis = d3.scale.linear()
    .range([height * 0.8, height * 0.2])
    .domain([G.domain.yAxis.min, G.domain.yAxis.max]);
  G.scale.width = d3.scale.sqrt()
    .range([5, width/20])
    .domain([G.domain.width.min, G.domain.width.max]);

  var xAxis, yAxis;
  xAxis = d3.svg.axis().scale(G.scale.xAxis).orient('top');
  yAxis = d3.svg.axis().scale(G.scale.yAxis).orient('right');
  var canvas = d3.select('#viz-canvas');
  canvas.select('#xAxis')
    .attr('transform', 'translate(0,'+(height-40)+')')
    .call(xAxis);
  canvas.select('#yAxis')
    .attr('transform', 'translate(40,0)')
    .call(yAxis);

  redraw();
}

function toTime(evt, value) {
  d3.select('#time-text').text(value);
  G.now = value;
  redraw();
}

function redraw() {
  var canvas = d3.select('#viz-canvas');
  // http://stackoverflow.com/questions/9589768/using-an-associative-array-as-data-for-d3
  var now = G.timeSlider.value();
  canvas.selectAll('.region')
    .transition()
    .attr('cx', function(d) { return G.scale.xAxis(d.value[now][G.fieldName['xAxis']]); })
    .attr('cy', function(d) { return G.scale.yAxis(d.value[now][G.fieldName['yAxis']]); })
    .attr('r', function(d) { return G.scale.width(d.value[now][G.fieldName['width']]/2); })
    .style('fill', function(d) { return d.value[now][G.fieldName['color']]; })
    .style('fill-opacity', 0.4)
    .select('.tooltip')
    .text(function(d) {
      var n = d.value[now];
      var msg =
	G.fieldName['region'] + ':' + n[G.fieldName['region']] + '\n' +
	G.fieldName['xAxis'] + ':' + n[G.fieldName['xAxis']] + '\n' +
	G.fieldName['yAxis'] + ':' + n[G.fieldName['yAxis']] + '\n' +
	G.fieldName['width'] + ':' + n[G.fieldName['width']];
      return msg;
    });
}

