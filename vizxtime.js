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
  fnTree: {},
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
  G.config = data[0];
  // field name for "region", field name for "time"
  var regionFN = G.config.dimExpr['region'], timeFN = G.config.dimExpr['time'];

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
    d3.select('#'+k+'-field').property('value', G.config.dimExpr[k]);
  });
  d3.selectAll('.editable').on('focus', fieldInputFocused);
  d3.select('#recalc').on('click', recalcRedraw);

  G.sample.region = Object.keys(G.joined)[0];
  G.sample.time = Object.keys(G.joined[G.sample.region])[0];
  G.sample.data = G.joined[G.sample.region][G.sample.time];

  G.dataFieldNames = Object.keys(G.sample.data).filter(function (d) {
    return d != G.config.dimExpr['region'] && d != G.config.dimExpr['time'];
  }).sort();

  var k;
  for (k in G.sample.data) {
    G.parsedSample['VxT' + G.dataFieldNames.indexOf(k)] = G.sample.data[k];
  }

  G.dataFieldNames.forEach(function (fn) {
    var par = G.fnTree;
    fn.split(':').forEach(function (seg) {
      if (! (seg in par)) { par[seg] = {}; }
      par = par[seg];
    });
  });

  d3.select('#data-field-names').html(genNestedList(G.fnTree));

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
  d3.select('#rsvg-box')
    .append('svg')
    .attr('preserveAspectRatio', 'xMinYMin meet')
    .attr('viewBox', '0 0 800 600')
    .classed('rsvg-content', true)
    .call(gpzoom)
    .append('g')
    .attr('id', 'viz-canvas');
  G.canvas = d3.select('#viz-canvas');

  var VB = d3.select('#rsvg-box svg')
    .attr('viewBox').split(' ').map(parseFloat);
  G.viewBox = { width: VB[2], height: VB[3] };

  G.canvas.append('g').attr('id', 'xAxis');
  G.canvas.append('g').attr('id', 'yAxis');

  recalcRedraw();
}

function genNestedList(fnTree, level) {
  if (! level) { level = 0; }
  var prefix = '  '.repeat(level), r = prefix + '<ul class="menu-tree">\n';
  Object.keys(fnTree).sort().forEach(function f(n) {
    r += prefix + '<li class="fn-segment">';
    if (fnTree[n] && typeof fnTree[n] === 'object' &&
      Object.keys(fnTree[n]).length > 0) {
      r += '<button class="pure-button pure-secondary fn-segment">' + n +
	'</button>' + genNestedList(fnTree[n], level+1);
    } else {
      r += '<button class="pure-button pure-primary fn-segment" onclick="pasteFieldName(this)">' + n + '</button>';
    }
    r += '</li>\n';
  });
  return r + prefix + '</ul>';
}

function fieldInputFocused() {
  if (G.lastFocus) {
    G.lastFocus.classed('active', false);
  }
  G.lastFocus = d3.select(this);
  G.lastFocus.classed('active', true);
}

function pasteFieldName(me) {
  if (! G.lastFocus) { return; }
  var id = G.lastFocus.attr('id');
  const fields = ['xAxis-field', 'yAxis-field', 'width-field'];
  if (fields.indexOf(id) < 0) { return; }
  var li, i, fieldName = d3.select(me).text();
  me = me.parentNode;
  for (i=0; i<9; ++i) {
    me = me.parentNode.parentNode;
    li = d3.select(me);
    b = li.select('button.fn-segment');
    if (! (li.classed('fn-segment') && b)) { break; }
    fieldName = b.text() + ':' + fieldName;
  }
  console.log(fieldName);
  var f = G.lastFocus;
  var s = f.property('value');
  f.property('value',
    s.substring(0,f.property('selectionStart')) +
    fieldName +
    s.substring(f.property('selectionEnd'), s.length)
  );
  G.lastFocus.node().focus();
}

function recalcRedraw() {
  var expr, field, region, time, k;
  for (field in G.exprFields) {
    G.domain[field] = { max: -9e99, min: 9e99 };
    expr = d3.select('#'+field+'-field').property('value');
    G.dataFieldNames.forEach(function (fn, i) {
      expr = expr.replace(fn, 'VxT'+i);
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
	  console.log('Failed evaluating "' + field + '" field for ' + time + ',' + region + '\n' + e.toString());
	}
      }
    }
  }

  // http://stackoverflow.com/questions/9589768/using-an-associative-array-as-data-for-d3
  var circles = G.canvas.selectAll('.region').data(d3.entries(G.evaluated));
  circles.exit().remove();
  circles.enter()
    .append('circle')
    .attr('cx', G.viewBox.width/2)
    .attr('cy', G.viewBox.height/2)
    .attr('r', 10)
    .style('fill', '#fff')
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
    .duration(1000)
    .attr('cx', function(d) { return G.scale.xAxis(d.value[now].xAxis); })
    .attr('cy', function(d) { return G.scale.yAxis(d.value[now].yAxis); })
    .attr('r', function(d) { return G.scale.width(d.value[now].width/2); })
    .style('fill', function(d) { return G.joined[d.key][now][G.config.dimExpr['color']]; })
    .style('fill-opacity', function(d) {
      d = d.value[now];
      return isNaN(d.xAxis) || isNaN(d.yAxis) || isNaN(d.width) ? 0 : 0.4;
    })
    .select('.tooltip')
    .text(function(d) {
      var n = d.value[now];
      var msg = d.key + '\n' +
	'x:' + n.xAxis + '\n' +
	'y:' + n.yAxis + '\n' +
	'w:' + n.width;
      return msg;
    });
}

  // http://stackoverflow.com/questions/9589768/using-an-associative-array-as-data-for-d3
