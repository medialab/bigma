import fetchline from "fetchline";
import {Sigma} from "sigma";
import DirectedGraph from "graphology";
import FA2Layout from "graphology-layout-forceatlas2/worker.js";
import forceAtlas2 from "graphology-layout-forceatlas2";

const graph = new DirectedGraph();

// Read nodes positions:
const loadPositions = async (positions) => {
  console.log("Loading positions file:", positions.name);
  const orderSpan = document.getElementById("order"),
    title = document.getElementById("title");
  title.textContent = "Loading nodes…";
  orderSpan.textContent = "…";
  document.querySelectorAll("#sigma-container canvas").forEach(e => e.parentNode.removeChild(e))
  document.getElementById("fa2").style.display = "none";
  document.getElementById('positions_file').disabled = "disabled";

  let order = 0;
  for await (const line of fetchline(URL.createObjectURL(positions))) {
    const [node, xPos, yPos] = line.split(/,/);
    if (!node || node.toLowerCase() === "node") continue;
    try {
      graph.addNode(node, {x: parseFloat(xPos), y: parseFloat(yPos)});
      order++;
      if (order % 5000 == 0)
        orderSpan.textContent = order + "…";
    } catch(e) {
      console.log("ERROR loading node:", line, e);
    }
  }
  orderSpan.textContent = order + "";
  document.getElementById("loadEdges").style.opacity = 1;
  if (graph.size) {
    title.textContent = "Affecting nodes size…"
    setTimeout(renderGraph, 0);
  }
}

// Read edges
const loadEdges = async (edgesfile) => {
  console.log("Loading edges file:", edgesfile);
  const sizeSpan = document.getElementById("size"),
    title = document.getElementById("title");
  title.textContent = "Loading edges…";
  sizeSpan.textContent = "…";
  document.querySelectorAll("#sigma-container canvas").forEach(e => e.parentNode.removeChild(e))
  document.getElementById("fa2").style.display = "none";
  document.getElementById('edges_file').disabled = "disabled";

  let size = 0;
  for await (const line of fetchline(URL.createObjectURL(edgesfile))) {
    const [source, target, weight] = line.split(/,/);
    if (!source || source.toLowerCase() === "source") continue;
    try {
      graph.addEdge(source, target, {weight: parseInt(weight)});
      size++;
      if (size % 50000 == 0)
        sizeSpan.textContent = size + "…";
    } catch(e) {
      console.log("ERROR loading edge:", line, e);
    }
  }
  sizeSpan.textContent = size + "";
  if (graph.order) {
    title.textContent = "Affecting nodes size…"
    setTimeout(renderGraph, 0);
  }
}

const renderGraph = () => {
// Adjust nodes sizes
  graph.forEachNode((node, { cluster }) => {
    graph.mergeNodeAttributes(node, {
      size: Math.sqrt(graph.degree(node)) / 10,
      //color: colors[cluster + ""],
      label: node
    });
  });
  title.textContent = "Rendering graph…";

  setTimeout(() => {
    // Render the graph:
    const container = document.getElementById("sigma-container");
    const renderer = new Sigma(graph, container, {
      defaultEdgeColor: "#efefef"
    });

    // Enable FA2 button:
    document.getElementById("fa2").style.display = "block";
    const fa2Button = document.getElementById("fa2");
    const sensibleSettings = forceAtlas2.inferSettings(graph);
    const fa2Layout = new FA2Layout(graph, {
      settings: sensibleSettings,
    });
    function toggleFA2Layout() {
      if (fa2Layout.isRunning()) {
        fa2Layout.stop();
        fa2Button.innerHTML = `Start layout ▶`;
      } else {
        fa2Layout.start();
        fa2Button.innerHTML = `Stop layout ⏸`;
      }
    }
    fa2Button.addEventListener("click", toggleFA2Layout);

    // Cheap trick: tilt the camera a bit to make labels more readable:
    renderer.getCamera().setState({
      angle: 0.2,
    });

    title.textContent = "Graph ready";
  }, 0);
}

document.getElementById('positions_file').addEventListener('change', (event) => {
  loadPositions(event.target.files[0]);
});
document.getElementById('edges_file').addEventListener('change', (event) => {
  loadEdges(event.target.files[0]);
});
