/* jshint esversion: 6, loopfunc: true */
/* global console, alert, location, d3, $, Parser, queue, Blob, saveAs */

var G = {
  viewBox: {},		// width and height of viewBox of #rsvg-box
  regions: {},		// original data read from filename.regions
  joined: {},		// main data structure (joining regions and data)
  evaluated: {},	// re-evaluated in recalcRedraw() after each change of expressions
  lastFocus: null,	// the html input element that most recently received input focus
  domain: {},		// min and max of xAxis, yAxis, and width
  scale: {},		// the scale objects for xAxis, yAxis, and width
  fn2Var: [],		// [field name] to [variable name] hash
  fnTree: {},		// field name tree for constructing the nested menu
  sample: {},		// one row of sample data
  parsedSample: {},	// values of var's in sample data
  xtraFun: {		// extra functions for the (expression) Parser.
    'ZaBin': XFZaBin,
  },
  exprFields: { xAxis:null, yAxis:null, width:null }
			// expressions for xAxis, yAxis, and width
}; // global variables

var configFN = $.url(location.href).param('config');
if (! configFN) { configFN = 'config.json'; }
$.getJSON(configFN)
  .done(function(data) {
    G.config = data;
    queue()
      .defer(d3.csv, G.config.filename.regions)
      .defer(d3.csv, G.config.filename.data)
      .awaitAll(init);
  })
  .fail(function( jqxhr, textStatus, error ) {
    var msg = 'failed reading config file "' + configFN + '"';
    alert(msg);
    throw new Error(msg);
  });

function organizeData(data) {
  // field name for "region", field name for "time"
  var regionFN = G.config.dimExpr['region'], timeFN = G.config.dimExpr['time'];

  // initialize G.joined from the data file
  data[1].forEach(function (d) {
    if (! (d[regionFN] in G.joined)) {
      G.joined[d[regionFN]] = {};
    }
    G.joined[d[regionFN]][d[timeFN]] = d;
  });

  // join the regions file into G.joined
  var region, time, k;
  data[0].forEach(function (d) {
    region = d[regionFN];
    for (time in G.joined[region]) {
      for (k in d) {
	G.joined[region][time][k] = d[k];
      }
    }
  });
  G.regions = data[0].map(function (d) { return d[regionFN]; });
}

function init(error, data) {
  /******************* received input data files *******************/
  if (error) { return console.warn(error); }

  organizeData(data);
  console.log(G);

  d3.select('#region-file').text(G.config.filename.regions);
  d3.select('#data-file').text(G.config.filename.data);
  ['region', 'time'].concat(Object.keys(G.exprFields)).forEach(function(k) {
    d3.select('#'+k+'-field').property('value', G.config.dimExpr[k]);
  });
  $('.editable').focus(function () {
    if (G.lastFocus) { G.lastFocus.removeClass('active'); }
    G.lastFocus = $(this);
    G.lastFocus.addClass('active');
  });

  G.sample.region = Object.keys(G.joined)[0];
  G.sample.time = Object.keys(G.joined[G.sample.region])[0];
  G.sample.data = G.joined[G.sample.region][G.sample.time];

  var fnlist = Object.keys(G.sample.data).filter(function (d) {
    return d != G.config.dimExpr['region'] &&
      d != G.config.dimExpr['time'] &&
      d != G.config.dimExpr['color'];
  });
  fnlist.sort(function(a,b) { return -a.localeCompare(b); } );
  // reverse sort, so that of all field names sharing the
  // same prefix, longer names appear earlier.
  // e.g. "abc:pqr:xyz" appears earlier than "abc:pqr",
  // which appears earlier than "abc"

  fnlist.forEach(function (fn, i) {
    G.fn2Var[fn] = 'VxT' + i;
    G.parsedSample[G.fn2Var[fn]] = G.sample.data[fn];
  });

  for (var fn in G.fn2Var) {
    var par = G.fnTree;
    fn.split(':').forEach(function (seg) {
      if (! (seg in par)) { par[seg] = {}; }
      par = par[seg];
    });
  }

  $('#data-field-names').html(genNestedList(G.fnTree));
  $('#data-field-names > ul').attr('id', 'fn-menu').menu();

  var getTimeField = function (d) {
    return d[G.config.dimExpr['time']];
  };
  var mn = d3.min(data[1], getTimeField),
      mx = d3.max(data[1], getTimeField);

  G.timeSlider = d3.slider().axis(true).min(mn).max(mx)
    .step(1).value(mx).on('slide', toTime);
  d3.select('#time-slider').call(G.timeSlider);
  d3.select('#time-text').text(mx);

  var gpzoom = d3.behavior.zoom()
    .scaleExtent([0.2, 8])
    .on('zoom', function () {
      d3.select('#viz-canvas').attr('transform', 'translate(' +
        d3.event.translate + ')scale(' + d3.event.scale + ')');
    });

  // http://bl.ocks.org/cpdean/7a71e687dd5a80f6fd57
  // https://stackoverflow.com/questions/16265123/resize-svg-when-window-is-resized-in-d3-js (responsive svg)
  d3.select('#rsvg-box svg')
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
  var prefix = '  '.repeat(level), r = prefix + '<ul>\n';
  Object.keys(fnTree).sort().forEach(function f(n) {
    r += prefix + '<li class="fn-segment">';
    if (fnTree[n] && typeof fnTree[n] === 'object' &&
      Object.keys(fnTree[n]).length > 0) {
      r += '<div class="fn-segment">' + n +
	'</div>' + genNestedList(fnTree[n], level+1);
    } else {
      r += '<div class="fn-segment" onclick="pasteFieldName(this)">' + n + '</div>';
    }
    r += '</li>\n';
  });
  return r + prefix + '</ul>';
}

function pasteFieldName(div) {
  if (! G.lastFocus) { return; }
  const fields = ['xAxis-field', 'yAxis-field', 'width-field'];
  if (fields.indexOf(G.lastFocus.attr('id')) < 0) { return; }
  div = $(div);
  var fieldName = div.text();
  do {
    div = div.parent('li').parent('ul').parent('li').children('div');
    if (div.length < 1) { break; }
    fieldName = div.text() + ':' + fieldName;
  } while (1);
  console.log(fieldName);
  var f = G.lastFocus;
  var s = f.val();
  f.val(
    s.substring(0,f.prop('selectionStart')) +
    fieldName +
    s.substring(f.prop('selectionEnd'), s.length)
  );
  G.lastFocus.focus();
}

function recalcRedraw() {
  var rawExpr, expr, field, region, time, fn, k;
  for (field in G.exprFields) {
    G.domain[field] = { max: -9e99, min: 9e99 };
    rawExpr = expr = d3.select('#'+field+'-field').property('value');
    for (fn in G.fn2Var) {
      expr = expr.replace(fn, G.fn2Var[fn]);
    }
    // http://javascript.info/tutorial/exceptions
    try {
      G.exprFields[field] = Parser.parse(expr);
      merge(G.exprFields[field].functions, G.xtraFun);
      G.exprFields[field].evaluate(G.parsedSample);
    } catch(e) {
      alert('Failed parsing "' + field + '" field:\n[ ' + expr + ' ]\n' + e.toString());
      return;
    }
    G.config.dimExpr[field] = rawExpr;
  }

  for (region in G.joined) {
    G.evaluated[region] = {};
    for (time in G.joined[region]) {
      G.evaluated[region][time] = {};
      var subst = {};
      for (fn in G.joined[region][time]) {
	subst[G.fn2Var[fn]] = G.joined[region][time][fn];
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
    .range([G.config.width.min, G.config.width.max])
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
  G.canvas.select('#xAxis')
    .selectAll('text')
    .attr('transform',' ');

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
    .attr('r', function(d) { return G.scale.width(d.value[now].width) / 2; })
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

function XFZaBin(p, N, mu) {
  // Normal approximation to Binomial
  // https://onlinecourses.science.psu.edu/stat414/node/179
  return (p-mu) / Math.sqrt(mu*(1-mu)/N);
}

function merge(dst, xtra) {
  Object.keys(xtra).forEach(function (x) {
    dst[x] = xtra[x];
  });
}

function saveConfig() {
  // http://www.javascripture.com/Blob
  var blob = new Blob(
    [JSON.stringify(G.config, null, 2)],
    {type: 'application/json', endings: 'native'}
  );
  saveAs(blob, 'config.json');
}

function saveDrawing() {
  // http://techslides.com/save-svg-as-an-image
  var blob = new Blob(
    [$('#rsvg-box svg').parent().html()],
    {type: 'image/svg+xml', endings: 'native'}
  );
  saveAs(blob, 'vizxtime.svg');
}

