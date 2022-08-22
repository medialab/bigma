import fetchline from "fetchline";
import {Sigma} from "sigma";
import DirectedGraph from "graphology";
import FA2Layout from "graphology-layout-forceatlas2/worker.js";
import forceAtlas2 from "graphology-layout-forceatlas2";

const loadGraph = async (positions) => {
  const graph = new DirectedGraph(),
    orderSpan = document.getElementById("order"),
    sizeSpan = document.getElementById("size"),
    title = document.getElementById("title"),
    edgesfile = positions.replace(/_positions_after.*$/, '');
  title.textContent = "Loading graph…";
  orderSpan.textContent = "…";
  sizeSpan.textContent = "…";
  document.querySelectorAll("#sigma-container canvas").forEach(e => e.parentNode.removeChild(e))
  document.getElementById("fa2").style.display = "none";

// Read nodes positions:
  let order = 0, size = 0;
  for await (const line of fetchline(positions)) {
    const [node, xPos, yPos] = line.split(/,/);
    if (!node || node === "Node") continue;
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
  sizeSpan.textContent = "…";

// Read edges
  for await (const line of fetchline(edgesfile)) {
    const [source, target, weight] = line.split(/,/);
    if (!source || source === "Source") continue;
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
  title.textContent = "Affecting nodes size…"

  setTimeout(() => {
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
  }, 0);
  return;
}

document.getElementById('positions_file').addEventListener('change', (event) => {
  loadGraph(event.target.files[0].name);
});
