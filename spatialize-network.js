// Usage (from a CSV file of edges formatted as source,target,weight
// node spatialize-network.js <EDGELIST_AS_SOURCE-TARGET-WEIGHT.CSV> <NB_FA2_ITERATIONS> <NB_ITERATIONS_BETWEEN_MINIATURE_PNG_SNAPSHOTS>
//
// or, to run more iterations after a previous run, using the positions CSV file dumped by the previous run (which should be named such as "ORIGINALFILE.csv_positions_after_N_FA2Iterations.csv"):
// node spatialize-network.js <POSITIONS_FILE_DUMPED_BY_THIS_SCRIPT.CSV> <NB_EXTRA_FA2_ITERATIONS> <NB_ITERATIONS_BETWEEN_MINIATURE_PNG_SNAPSHOTS>

import fs from 'fs';
import es from 'event-stream';
import DirectedGraph from 'graphology';
import random from 'graphology-layout/random.js';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import louvain from 'graphology-communities-louvain';
import {renderToPNG} from 'graphology-canvas/node.js';
import {density} from 'graphology-metrics/graph/density.js';

const args = process.argv.slice(2);
const filename = args[0];
const fileroot = filename.replace(/.csv(_positions_after_(\d+)_FA2Iterations\.csv)?$/, '');
const preIterations = (/_positions_after_\d+_FA2Iterations\.csv$/.test(filename) ? parseInt(filename.replace(/^.*_positions_after_(\d+)_FA2Iterations\.csv/, '$1')) : 0);
const FA2Iterations = (args.length < 2 ? 1000 : parseInt(args[1]));
const batchIterations = (args.length < 3 ? 100 : parseInt(args[2]));

let stop = false;
process.on('SIGINT', () => {
  stop = true;
  console.log("Caught interrupt signal, finishing current batch, plotting final image and saving nodes positions...");
});

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
  renderPNG(graph, fileroot + "_" + (doneIterations + preIterations), 512, function(){
    if (!stop && doneIterations < FA2Iterations)
      runBatchFA2(graph, doneIterations, finalCallback);
    else finalCallback(doneIterations);
  });
}

function processGraph(graph, time0){

  // Displaying graph's stats
  console.log('Number of nodes:', graph.order);
  console.log('Number of edges:', graph.size);
  console.log('Graph density:', density(graph));

/* Commenting this part for now since we do not do everything with the communities nor store them in the output graph
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
*/

  // Spatializing with FA2
  console.log('Starting ForceAtlas2 for ' + FA2Iterations + ' iterations by batches of ' + batchIterations);
  runBatchFA2(graph, 0, function(doneIterations) {
    let time1 = Date.now();
    console.log('ForceAtlas2 ' + (stop ? 'partia' : 'fu') + 'lly processed in:', (time1 - time0)/1000 + "s (" + doneIterations + " iterations)");
    time0 = time1;

    // Rendering final PNG image
    const outputFile = fileroot + "_after_" + (doneIterations + preIterations) + "_FA2Iterations";
    renderPNG(graph, outputFile, 8192, function() {
      // Saving resulting positions to a new CSV file
      time0 = Date.now()
      const posFile = fileroot + ".csv" + "_positions_after_" + (doneIterations + preIterations) + "_FA2Iterations.csv";
      const out = fs.createWriteStream(posFile);
      out.write("Node,xPos,yPos\n");
      graph.forEachNode(function(node, attrs){
        out.write(node + ',' + attrs['x'] + ',' + attrs['y'] + "\n");
      });
      console.log('Positions stored in ' + posFile + ' in:', (Date.now() - time0)/1000 + "s");
    });
  });
}

let time0 = Date.now();
// Read edges file line by line and adds nodes/edges
const graph = new DirectedGraph();
fs.createReadStream(fileroot + ".csv")
  .pipe(es.split())
  .pipe(es.mapSync(function(line) {
    const [source, target, weight] = line.split(/,/);
    if (!source || source === "Source") return;
    graph.mergeNode(source);
    graph.mergeNode(target);
    graph.addEdge(source, target, {weight: parseInt(weight)});
  }))

// Then assign either random positions to node on first run
  .on("end", function() {
    let time1 = Date.now();
    console.log('Graph loaded from edges list in:', (time1 - time0)/1000 + "s");
    time0 = time1;
    if (preIterations == 0) {
      random.assign(graph);
      time1 = Date.now();
      console.log('Random positions assigned in:', (time1 - time0)/1000 + "s");
      time0 = time1;

      processGraph(graph, time0);

// or reload positions from a previous run's output
    } else {
      fs.createReadStream(filename)
        .pipe(es.split())
        .pipe(es.mapSync(function(line) {
          const [node, xPos, yPos] = line.split(/,/);
          if (!node || node === "Node") return;
          graph.mergeNode(node, {x: parseFloat(xPos), y: parseFloat(yPos)});
        }))

        .on("end", function() {
          time1 = Date.now();
          console.log('Positions from previous run assigned in:', (time1 - time0)/1000 + "s");
          time0 = time1;

          processGraph(graph, time0);
        });
    }
  });

