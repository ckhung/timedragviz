/* global console, d3, queue */

var G = { }; // global variables

function organizeData(data) {
  // id field name, time field name
console.log(data);
  G.mapping = data[0].startval.mapping;
  var idFN = G.mapping['id'], timeFN = G.mapping['time'];
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

  // G.editor = new JSONEditor($('#config')[0], config);
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
  d3.select('#viz-rsvg-wrapper')
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
  refresh();
}

function snapshotValuesOf(fieldName) {
  var now = G.timeSlider.value();
  return Object.keys(G.region).map(function(d) {
    return G.region[d][now][G.mapping[fieldName]];
  });
}

function refresh() {
  // https://stackoverflow.com/questions/16265123/resize-svg-when-window-is-resized-in-d3-js
  var viewBox = d3.select('#viz-rsvg-wrapper svg')
    .attr('viewBox').split(' ').map(parseFloat);
  var width = viewBox[2], height = viewBox[3];

  var dataValues = snapshotValuesOf('cx').map(parseFloat);
  var sx = d3.scale.linear()
    .range([width * 0.2, width * 0.8])
    .domain([d3.min(dataValues), d3.max(dataValues)]);
  dataValues = snapshotValuesOf('cy').map(parseFloat);
  var sy = d3.scale.linear()
    .range([height * 0.8, height * 0.2])
    .domain([d3.min(dataValues), d3.max(dataValues)]);
  dataValues = snapshotValuesOf('radius').map(parseFloat);
  var sr = d3.scale.sqrt()
    .range([5, 40])
    .domain([d3.min(dataValues), d3.max(dataValues)]);

  var canvas = d3.select('#viz-canvas');
  // http://stackoverflow.com/questions/9589768/using-an-associative-array-as-data-for-d3
  var now = G.timeSlider.value();
  canvas.selectAll('.region')
    .transition()
    .attr('cx', function(d) { return sx(d.value[now][G.mapping['cx']]); })
    .attr('cy', function(d) { return sy(d.value[now][G.mapping['cy']]); })
    .attr('r', function(d) { return sr(d.value[now][G.mapping['radius']]); })
    .style('fill', function(d) { return d.value[now][G.mapping['color']]; })
    .select('.tooltip')
    .text(function(d) {
      var n = d.value[now];
      var msg =
	G.mapping['id'] + ':' + n[G.mapping['id']] + '\n' +
	G.mapping['cx'] + ':' + n[G.mapping['cx']] + '\n' +
	G.mapping['cy'] + ':' + n[G.mapping['cy']] + '\n' +
	G.mapping['radius'] + ':' + n[G.mapping['radius']];
      return msg;
    });
}

function toTime(evt, value) {
  d3.select('#time-text').text(value);
  G.now = value;
  refresh();
}

queue()
  .defer(d3.json, 'config.json')
  .defer(d3.csv, 'regions.csv')
  .defer(d3.csv, 'data.csv')
  .awaitAll(init);

