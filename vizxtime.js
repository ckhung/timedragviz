/* jshint esversion: 6, loopfunc: true */
/* global console, alert, Parser, d3, queue */

var G = {
  filename: {
    config: 'config.json',
    regions: 'regions.csv',
    data: 'data.csv'
  },
  viewBox: {},
  regions: {},
  joined: {},
  evaluated: {},
  lastFocus: null,
  domain: {},
  scale: {},
  dataFieldNames: [],
  sample: {},
  parsedSample: {},
  exprFields: { xAxis:null, yAxis:null, width:null }
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
  var regionFN = G.fieldName['region'], timeFN = G.fieldName['time'];

  // initialize G.joined from the data file
  data[2].forEach(function (d) {
    if (! (d[regionFN] in G.joined)) {
      G.joined[d[regionFN]] = {};
    }
    G.joined[d[regionFN]][d[timeFN]] = d;
  });

  // join the regions file into G.joined
  var region, time, k;
  data[1].forEach(function (d) {
    region = d[regionFN];
    for (time in G.joined[region]) {
      for (k in d) {
	G.joined[region][time][k] = d[k];
      }
    }
  });
  G.regions = data[1].map(function (d) { return d[regionFN]; });
}

function init(error, data) {
  /******************* received input data files *******************/
  if (error) { return console.warn(error); }

  organizeData(data);
  console.log(G);

  ['region', 'time'].concat(Object.keys(G.exprFields)).forEach(function(k) {
    d3.select('#'+k+'-field').property('value', G.fieldName[k]);
  });
  d3.selectAll('.editable').on('focus', fieldInputFocused);
  d3.select('#recalc').on('click', recalcRedraw);

  G.sample.region = Object.keys(G.joined)[0];
  G.sample.time = Object.keys(G.joined[G.sample.region])[0];
  G.sample.data = G.joined[G.sample.region][G.sample.time];

  G.dataFieldNames = Object.keys(G.sample.data).filter(function (d) {
    return d != G.fieldName['region'] && d != G.fieldName['time'];
  }).sort();

  var k;
  for (k in G.sample.data) {
    G.parsedSample['VxT' + G.dataFieldNames.indexOf(k)] = G.sample.data[k];
  }

  d3.select('#data-field-names')
    .selectAll('button')
    .data(G.dataFieldNames)
    .enter()
    .append('button')
    .attr('class', 'pure-secondary')
    .on('click', pasteFieldName)
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
  // https://stackoverflow.com/questions/16265123/resize-svg-when-window-is-resized-in-d3-js (responsive svg)
  d3.select('#viz-pane')
    .append('svg')
    .attr('preserveAspectRatio', 'xMinYMin meet')
    .attr('viewBox', '0 0 800 600')
    .classed('rsvg-content', true)
    .call(gpzoom)
    .append('g')
    .attr('id', 'viz-canvas');
  G.canvas = d3.select('#viz-canvas');

  var VB = d3.select('#viz-pane svg')
    .attr('viewBox').split(' ').map(parseFloat);
  G.viewBox = { width: VB[2], height: VB[3] };

  G.canvas.append('g').attr('id', 'xAxis');
  G.canvas.append('g').attr('id', 'yAxis');

  recalcRedraw();
}

function fieldInputFocused() {
  if (G.lastFocus) {
    G.lastFocus.classed('active', false);
  }
  G.lastFocus = d3.select(this);
  G.lastFocus.classed('active', true);
}

function pasteFieldName(fieldName) {
  if (! G.lastFocus) { return; }
  var id = G.lastFocus.attr('id');
  const fields = ['xAxis-field', 'yAxis-field', 'width-field'];
  if (fields.indexOf(id) < 0) { return; }
  var f = G.lastFocus;
  var s = f.property('value');
  f.property('value',
    s.substring(0,f.property('selectionStart')) +
    fieldName +
    s.substring(f.property('selectionEnd'), s.length)
  );
}

function recalcRedraw() {
  var expr, field, region, time, k;
  for (field in G.exprFields) {
    G.domain[field] = { max: -9e99, min: 9e99 };
    expr = d3.select('#'+field+'-field').property('value');
    G.dataFieldNames.forEach(function (f, i) {
      expr = expr.replace(f, 'VxT'+i);
    });
    // http://javascript.info/tutorial/exceptions
    try {
      G.exprFields[field] = Parser.parse(expr);
      G.exprFields[field].evaluate(G.parsedSample);
    } catch(e) {
      alert('Failed parsing "' + field + '" field:\n[ ' + expr + ' ]\n' + e.toString());
      return;
    }
  }

  for (region in G.joined) {
    G.evaluated[region] = {};
    for (time in G.joined[region]) {
      G.evaluated[region][time] = {};
      var subst = {};
      for (k in G.joined[region][time]) {
        subst['VxT' + G.dataFieldNames.indexOf(k)] = G.joined[region][time][k];
      }
      for (field in G.exprFields) {
	try {
	  var v = parseFloat(G.exprFields[field].evaluate(subst));
	  if (v > G.domain[field].max) { G.domain[field].max = v; }
	  if (v < G.domain[field].min) { G.domain[field].min = v; }
	  G.evaluated[region][time][field] = v;
	} catch(e) {
	  console.log(time,region,field,e);
	}
      }
    }
  }

  // http://stackoverflow.com/questions/9589768/using-an-associative-array-as-data-for-d3
  var circles = G.canvas.selectAll('.region').data(d3.entries(G.evaluated));
  circles.exit().remove();
  circles.enter()
    .append('circle')
    .classed('region', true)
    .append('svg:title')
    .classed('tooltip', true);

  // https://stackoverflow.com/questions/16919280/how-to-update-axis-using-d3-js
  G.scale.xAxis = d3.scale.linear()
    .range([G.viewBox.width * 0.2, G.viewBox.width * 0.8])
    .domain([G.domain.xAxis.min, G.domain.xAxis.max]);
  G.scale.yAxis = d3.scale.linear()
    .range([G.viewBox.height * 0.8, G.viewBox.height * 0.2])
    .domain([G.domain.yAxis.min, G.domain.yAxis.max]);
  G.scale.width = d3.scale.linear()
    .range([5, G.viewBox.width/20])
    .domain([G.domain.width.min, G.domain.width.max]);
  var xAxis, yAxis;
  xAxis = d3.svg.axis().scale(G.scale.xAxis).orient('top');
  yAxis = d3.svg.axis().scale(G.scale.yAxis).orient('right');
  G.canvas.select('#xAxis')
    .attr('transform', 'translate(0,'+(G.viewBox.height-40)+')')
    .call(xAxis);
  G.canvas.select('#yAxis')
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
  var now = G.timeSlider.value();
  G.canvas.selectAll('.region')
    .transition()
    .attr('cx', function(d) { return G.scale.xAxis(d.value[now].xAxis); })
    .attr('cy', function(d) { return G.scale.yAxis(d.value[now].yAxis); })
    .attr('r', function(d) { return G.scale.width(d.value[now].width/2); })
    .style('fill', function(d) { return G.joined[d.key][now][G.fieldName['color']]; })
    .style('fill-opacity', 0.4)
    .select('.tooltip')
    .text(function(d) {
      var n = d.value[now];
      var msg =
	G.fieldName['region'] + ':' + n[G.fieldName['region']] + '\n' +
	G.fieldName['xAxis'] + '(x):' + n[G.fieldName['xAxis']] + '\n' +
	G.fieldName['yAxis'] + '(y):' + n[G.fieldName['yAxis']] + '\n' +
	G.fieldName['width'] + '(w):' + n[G.fieldName['width']];
      return msg;
    });
}

  // http://stackoverflow.com/questions/9589768/using-an-associative-array-as-data-for-d3
