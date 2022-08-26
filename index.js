import fetchline from "fetchline";
import {Sigma} from "sigma";
import DirectedGraph from "graphology";
import FileSaver from "file-saver";


const graph = new DirectedGraph();

const fmtN = (n) => {
  return (n + "").replace(/(.{9})$/, "&nbsp;$1")
    .replace(/(.{6})$/, "&nbsp;$1")
    .replace(/(.{3})$/, "&nbsp;$1");
}

// Read nodes positions:
const loadPositions = async (positions) => {
  console.log("Loading positions file:", positions.name);
  const orderSpan = document.getElementById("order"),
    title = document.getElementById("title"),
    loader = document.getElementById("loader");
  title.textContent = "Loading nodes…";
  orderSpan.innerHTML = "0…";
  loader.style.display = "block";
  document.getElementById('loadPositions').style.display = "none";
  document.getElementById('nodes').style.display = "block";

  let order = 0;
  for await (const line of fetchline(URL.createObjectURL(positions))) {
    const [node, xPos, yPos] = line.split(/,/);
    if (!node || node.toLowerCase() === "node") continue;
    try {
      graph.addNode(node, {x: parseFloat(xPos), y: parseFloat(yPos)});
      order++;
      if (order % 1000 == 0)
        orderSpan.innerHTML = fmtN(order) + "…";
    } catch(e) {
      console.log("bloading node:", line, e);
    }
  }
  orderSpan.innerHTML = fmtN(order);
  title.textContent = "";
  document.getElementById('loadEdges').style.display = "block";
  loader.style.display = "none";
}

// Read edges
const loadEdges = async (edgesfile) => {
  console.log("Loading edges file:", edgesfile.name);
  const sizeSpan = document.getElementById("size"),
    title = document.getElementById("title");
  title.textContent = "Loading edges…";
  sizeSpan.innerHTML = "0…";
  document.getElementById("loader").style.display = "block";
  document.getElementById('loadEdges').style.display = "none";
  document.getElementById('edges').style.display = "block";

  let size = 0;
  for await (const line of fetchline(URL.createObjectURL(edgesfile))) {
    const [source, target, weight] = line.split(/,/);
    if (!source || source.toLowerCase() === "source") continue;
    try {
      graph.addEdge(source, target, {weight: parseInt(weight)});
      size++;
      if (size % 10000 == 0)
        sizeSpan.innerHTML = fmtN(size) + "…";
    } catch(e) {
      console.log("ERROR loading edge:", line, e);
    }
  }
  sizeSpan.innerHTML = fmtN(size);
  title.textContent = "Affecting nodes size…"
  setTimeout(renderGraph, 0);
}

const renderGraph = () => {
// Adjust nodes sizes
  graph.forEachNode((node, { cluster }) => {
    graph.mergeNodeAttributes(node, {
      size: Math.sqrt(graph.degree(node)) / 6,
      //color: colors[cluster + ""],
      label: node
    });
  });
  title.textContent = "Rendering graph…";

  setTimeout(() => {
    // Render the graph:
    const container = document.getElementById("sigma-container");
    const renderer = new Sigma(graph, container, {
      defaultEdgeColor: "#efefef",
      minCameraRatio: 0.1,
      maxCameraRatio: 10
    });
    document.getElementById("controls").style.display = "block";

    // Enable Zoombuttons:
    const camera = renderer.getCamera();
    document.getElementById("zoom-in").addEventListener("click", () => {
      camera.animatedZoom({ duration: 600 });
    });
    document.getElementById("zoom-out").addEventListener("click", () => {
      camera.animatedUnzoom({ duration: 600 });
    });
    document.getElementById("zoom-reset").addEventListener("click", () => {
      camera.animatedReset({ duration: 600 });
    });

    // Bind labels threshold to range input
    const labelsThresholdRange = document.getElementById("labels-threshold");
    labelsThresholdRange.addEventListener("input", () => {
      renderer.setSetting("labelRenderedSizeThreshold", -labelsThresholdRange.value);
    });
    labelsThresholdRange.value = -renderer.getSetting("labelRenderedSizeThreshold") + "";

    // Setup nodes search
    const searchInput = document.getElementById("search-input");
    const searchSuggestions = document.getElementById("suggestions");
    let selectedNode = null,
      suggestions = [];
    const setSearchQuery = (query) => {
      if (searchInput.value !== query) searchInput.value = query;
      if (query.length > 1) {
        const lcQuery = query.toLowerCase();
        suggestions = [];
        graph.forEachNode((node) => {
          if (node.toLowerCase().includes(lcQuery))
            suggestions.push(node);
        });

        if (suggestions.length === 1 && suggestions[0] === query) {
          if (selectedNode)
            graph.setNodeAttribute(selectedNode, "highlighted", false);
          selectedNode = suggestions[0];
          suggestions = [];
          graph.setNodeAttribute(selectedNode, "highlighted", true);
          let view = renderer.getNodeDisplayData(selectedNode);
          view.ratio = camera.ratio / 1.5;
          camera.animate(view, {duration: 1000});
        } else if (selectedNode) {
          graph.setNodeAttribute(selectedNode, "highlighted", false);
          selectedNode = null;
        }
      } else if (selectedNode) {
        graph.setNodeAttribute(selectedNode, "highlighted", false);
        selectedNode = null;
        suggestions = [];
      }
      searchSuggestions.innerHTML = suggestions
        .sort()
        .map((node) => "<option value=" + node + "></option>")
        .join("\n");
      // Refresh rendering:
      renderer.refresh();
    }
    searchInput.addEventListener("input", () => {
      setSearchQuery(searchInput.value || "");
    });
    searchInput.addEventListener("blur", () => {
      setSearchQuery("");
    });

    // Enable SavePNG button
    document.getElementById("save-as-png").addEventListener("click", () => {
      document.getElementById("loader").style.display = "block";
      setTimeout(async () => {
        const { width, height } = renderer.getDimensions();
        const pixelRatio = window.devicePixelRatio || 1;
        const tmpRoot = document.createElement("DIV");
        tmpRoot.style.width = `${width}px`;
        tmpRoot.style.height = `${height}px`;
        tmpRoot.style.position = "absolute";
        tmpRoot.style.right = "101%";
        tmpRoot.style.bottom = "101%";
        document.body.appendChild(tmpRoot);
        const tmpRenderer = new Sigma(graph, tmpRoot, renderer.getSettings());
        tmpRenderer.getCamera().setState(camera.getState());
        tmpRenderer.refresh();
        const canvas = document.createElement("CANVAS");
        canvas.setAttribute("width", width * pixelRatio + "");
        canvas.setAttribute("height", height * pixelRatio + "");
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width * pixelRatio, height * pixelRatio);
        const canvases = tmpRenderer.getCanvases();
        const layers = Object.keys(canvases);
        layers.forEach((id) => {
          ctx.drawImage(
            canvases[id],
            0,
            0,
            width * pixelRatio,
            height * pixelRatio,
            0,
            0,
            width * pixelRatio,
            height * pixelRatio,
          );
        });
        canvas.toBlob((blob) => {
          if (blob) FileSaver.saveAs(blob, "graph.png");
          tmpRenderer.kill();
          tmpRoot.remove();
          document.getElementById("loader").style.display = "none";
        }, "image/png");
      }, 50);
    });

    title.textContent = "Graph ready!";
    document.getElementById("loader").style.display = "none";
  }, 0);
}

document.getElementById('positions_file').addEventListener('change', (event) => {
  loadPositions(event.target.files[0]);
});
document.getElementById('edges_file').addEventListener('change', (event) => {
  loadEdges(event.target.files[0]);
});
