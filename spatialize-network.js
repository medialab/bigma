// Usage (with 8GB heap size given to node)
// node --max-old-space-size=8192 spatialize-network.js <EDGELIST_AS_SOURCE-TARGET-WEIGHT.CSV> <NB_FA2_ITERATIONS> <NB_ITERATIONS_BETWEEN_MINIATURE_PNG_SNAPSHOTS>
// or:
// node --max-old-space-size=8192 spatialize-network.js <GRAPH_DUMPED_BY_THIS_SCRIPT.JSON> <NB_EXTRA_FA2_ITERATIONS> <NB_ITERATIONS_BETWEEN_MINIATURE_PNG_SNAPSHOTS>

import fs from 'fs';
import es from 'event-stream';
import { JsonStreamStringify } from 'json-stream-stringify';
import DirectedGraph from 'graphology';
import random from 'graphology-layout/random.js';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import louvain from 'graphology-communities-louvain';
import {renderToPNG} from 'graphology-canvas/node.js';
import {density} from 'graphology-metrics/graph/density.js';

const args = process.argv.slice(2);
const filename = args[0];
const fileroot = filename.replace(/(_(\d+)FA2Iterations)?.(csv|json)/, '');
const preIterations = (/_(\d+)FA2Iterations\.json$/.test(filename) ? parseInt(filename.replace(/^.*_(\d+)FA2Iterations\.json/, '$1')) : 0);
const FA2Iterations = (args.length < 2 ? 1000 : parseInt(args[1]));
const batchIterations = (args.length < 3 ? 100 : parseInt(args[2]));

function renderPNG(graph, imagefile, size, callback) {
  const t0 = Date.now();
  renderToPNG(
    graph,
    imagefile + ".png",
    {
      width: size,
      height: size,
      nodes: {defaultColor: '#000'},
      edges: {defaultColor: '#ccc'},
    },
    () => {
      console.log(" " + imagefile + '.png rendered in:', (Date.now() - t0)/1000 + "s");
      callback();
    }
  );
}

function runBatchFA2(graph, doneIterations, finalCallback) {
  const t0 = Date.now();
  forceAtlas2.assign(graph, {
    iterations: batchIterations,
    getWeight: 'weight',
    getEdgeWeight: 'weight',
    settings: {
      barnesHutOptimize: true,
      edgeWeightInfluence: 1,
      gravity: 0.05,
      scalingRatio: 20,
      strongGravityMode: true
    }
  });
  console.log(' FA2 batch of ' + batchIterations + ' iterations processed in:', (Date.now() - t0)/1000 + "s");
  doneIterations += batchIterations;
  if (doneIterations < FA2Iterations)
    renderPNG(graph, fileroot + "_" + (doneIterations + preIterations), 256, function(){
      runBatchFA2(graph, doneIterations, finalCallback);
    });
  else finalCallback();
}

function streamWriteJSON(outputFile, obj) {
  var out = fs.createWriteStream(outputFile);
  const jsonStream = new JsonStreamStringify(obj);
  jsonStream.once('error', () => console.log('Error writing JSON data', jsonStream.stack.join('.')));
  jsonStream.pipe(out);
  console.log('Resulting graph stored in', outputFile);
}

function processGraph(graph, time0){

  // Displaying graph's stats
  let time1 = Date.now();
  console.log('Graph loaded in:', (time1 - time0)/1000 + "s");
  time0 = time1
  console.log('Number of nodes:', graph.order);
  console.log('Number of edges:', graph.size);
  console.log('Graph density:', density(graph));

  if (preIterations == 0) {
    // Computing Louvain communities
    const details = louvain.detailed(graph, {
      getEdgeWeight: 'weight',
      resolution: 0.05
    });
    time1 = Date.now();
    console.log('Louvain processed in:', (time1 - time0)/1000 + "s");
    time0 = time1;
    console.log('Louvain communities:', details.count);
    console.log('Louvain modularity:', details.modularity);
  }

  // Spatializing with FA2
  console.log('Starting ForceAtlas2 for ' + FA2Iterations + ' iterations by batches of ' + batchIterations);
  runBatchFA2(graph, 0, function() {
    time1 = Date.now();
    console.log('ForceAtlas2 fully processed in:', (time1 - time0)/1000 + "s (" + FA2Iterations + " iterations)");
    time0 = time1;

    // Rendering final PNG image
    const outputFile = fileroot + "_" + (FA2Iterations + preIterations) + "FA2Iterations";
    renderPNG(graph, outputFile + ".png", 8192, function() {
      // Saving result to graphology's serialized JSON format
      const serialized = graph.export();
      streamWriteJSON(outputFile + ".json", serialized);
    });
  });
}

let time0 = Date.now();
if (preIterations == 0) {
  // Read edges file line by line and adds nodes/edges
  const graph = new DirectedGraph();
  fs.createReadStream(filename)
    .pipe(es.split())
    .pipe(es.mapSync(function(line) {
      const [source, target, weight] = line.split(/,/);
      if (source === "Source") return;
      graph.mergeNode(source);
      graph.mergeNode(target);
      graph.addEdge(source, target, {weight});
    }))

    // Then work with the full graph
    .on("end", function() {
      random.assign(graph);
      processGraph(graph, time0);
    });

} else {
  // Read serialized json graph from previous run
  const data = JSON.parse(fs.readFileSync(filename));
  const graph = DirectedGraph.from(data);
  processGraph(graph, time0);
}

