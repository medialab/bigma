import fetchline from "fetchline";
import {Sigma} from "sigma";
import DirectedGraph from "graphology";
import FileSaver from "file-saver";
import rgb from "hsv-rgb";


/* TODO:
  - setup build for gh pages
*/


const graph = new DirectedGraph();
let renderer = null,
  metas_infos = {};

const cleanQuotes = (arr) => {
  return arr.map((x) => {
    return x.replace(/(^"|"$)/g, "")
      .replace(/""/, '"');
  });
}
const safeParseFloat = (x) => {
  const rgx = /^([+-]?[\d\.]+e([-+]?\d+)$)/;
  if (rgx.test(x)) {
    return parseFloat(x.replace(rgx, "$1")) * 10**parseInt(x.replace(rgx, "$2"));
  }
  return parseFloat(x);
}
const fmtN = (n) => {
  return (n + "").replace(/(.{9})$/, "&nbsp;$1")
    .replace(/(.{6})$/, "&nbsp;$1")
    .replace(/(.{3})$/, "&nbsp;$1")
    .replace(/^&nbsp;/, "");
}
const dispN = (n) => String(Math.round(n)).replace(/\..*$/, '')

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
    const [node, xPos, yPos] = cleanQuotes(line.split(/,/));
    if (!node || node.toLowerCase() === "node") continue;
    try {
      graph.addNode(node, {x: safeParseFloat(xPos), y: safeParseFloat(yPos)});
      order++;
      if (order % 1000 == 0)
        orderSpan.innerHTML = fmtN(order) + "…";
    } catch(e) {
      console.log("ERROR loading node:", line, e);
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
    const [source, target, weight] = cleanQuotes(line.split(/,/));
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
  setTimeout(renderGraph, 10);
}

// Read metadata
const loadMetadata = async (metadatafile) => {
  console.log("Loading metadata file:", metadatafile.name);
  const metalog = document.getElementById("metadatalog");
  metalog.innerHTML = "Loading metadata…";
  document.getElementById("loader").style.display = "block";
  document.getElementById('loadMetadata').style.display = "none";

  let rows = 0,
    errors = [],
    headers = [];
  for await (const line of fetchline(URL.createObjectURL(metadatafile))) {
    const row = cleanQuotes(line.split(/,/));
    const node = row[0];
    const metas = row.slice(1);
    if (!node) continue;
    if (node.toLowerCase() === "node") {
      headers = metas;
      continue;
    }
    if (!rows) {
      for (let i in headers) {
        const hd = headers[i];
        if (!isNaN(safeParseFloat(metas[i])))
          metas_infos[hd] = {type: safeParseFloat};
        else metas_infos[hd] = {type: String};
        metas_infos[hd].valuesCount = {};
        metas_infos[hd].count = 0;
        metas_infos[hd].idx = parseInt(i);
      }
    }
    const attrs = {};
    for (let i in headers) {
      const hd = headers[i],
        parse = metas_infos[hd].type,
        val = parse(metas[i]);
      if (parse != String && isNaN(val)) {
        if (metas[i] !== "")
          console.log("WARNING: NaN found for row", i, hd, "when applying", parse, "to", metas[i], ":", val);
        continue;
      }
      attrs[hd] = val;
      metas_infos[hd].count++;
      metas_infos[hd].valuesCount[val] = (metas_infos[hd].valuesCount[val] || 0) + 1;
      if (parse != String) {
        if (metas_infos[hd].min == undefined) {
          metas_infos[hd].min = val;
          metas_infos[hd].max = val;
        } else {
          metas_infos[hd].min = Math.min(metas_infos[hd].min, val);
          metas_infos[hd].max = Math.max(metas_infos[hd].max, val);
        }
      }
    }
    try {
      graph.mergeNodeAttributes(node, attrs)
      rows++;
    } catch(e) {
      errors.push([row, e]);
    }
  }
  for (let key in metas_infos)
    metas_infos[key].values = Object.keys(metas_infos[key].valuesCount).sort();
  if (errors.length > 0) console.log(errors.length + " errors:", errors);
  console.log(metas_infos);
  metalog.innerHTML = "<b>" + headers.length + " attributes usable for coloring:</b><br/>" +
    '<select id="colorChoice"><option class="code" value="">choose an attribute…</option>' + headers.sort().map((x) => '<option class="code" value="' + x + '">' + x + '</option>').join("") + "</select>";
  const select = document.getElementById('colorChoice');
  select.addEventListener('change', (event) => {
    document.getElementById("loader").style.display = "block";
    setTimeout(() => colorizeGraph(select.value), 10);
  });
  document.getElementById("loader").style.display = "none";
}

const renderGraph = () => {
// Adjust nodes sizes
  graph.forEachNode((node) => {
    const deg = graph.degree(node);
    graph.mergeNodeAttributes(node, {
      degree: deg,
      size: Math.sqrt(deg) / 6,
      label: node
    });
  });
  title.textContent = "Rendering graph…";

  setTimeout(() => {
    // Render the graph:
    renderer = new Sigma(graph, document.getElementById("sigma-container"), {
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
      }, 10);
    });

    title.textContent = "Graph ready!";
    document.getElementById("loader").style.display = "none";
    document.getElementById("colors").style.display = "block";
  }, 10);
}

// Adjust nodes colors
const negScale = (x, min, extent) => {
  return "rgb(" + rgb(20, 100, 100 * Math.sqrt((min - x) / extent)).join() + ")";
};
const posScale = (x, min, extent) => {
  return "rgb(" + rgb(218, 100, 100 * Math.sqrt((x - min) / extent)).join() + ")";
};
const fixedPalette = [
  "#5fb1ff",
  "#ff993e",
  "#8b4a98",
  "#bce25b",
  "#d52f3f",
  "#0051c4",
  "#2cc143",
  "#c45ecf",
  "#ded03f",
  "#904f13",
];
const colorizeGraph = (attr) => {
  const legend = document.getElementById("legend");
  let colorScale = null;
  if (attr === "") {
    legend.style.display = "none";
    colorScale = (x) => "#999";
  } else {
    legend.style.display = "block";
    const info = metas_infos[attr];
    console.log("Colorizing graph based on field", attr, info);
    // Contiguous variables
    if (info.type != String && info.values.length > 10) {
      if (info.min >= 0) {
        colorScale = (x) => posScale(x, info.min, info.max - info.min);
        legend.innerHTML = '<div id="grad" style="background-image: linear-gradient(to right, ' + posScale(0, 0, 1) + ', ' + posScale(1, 0, 1) + ')"></div><span id="minval">' + dispN(info.min) + '</span><span id="maxval">' + dispN(info.max) + '</span>';
      } else if (info.max <= 0) {
        colorScale = (x) => negScale(x, info.min, info.max - info.min);
        legend.innerHTML = '<div id="grad" style="background-image: linear-gradient(to right, ' + negScale(-1, 0, 1) + ', ' + negScale(0, 0, 1) + ')"></div><span id="minval">' + dispN(info.min) + '</span><span id="maxval">' + dispN(info.max) + '</span>';
      } else {
        const maxExtent = Math.max(-info.min, info.max);
        colorScale = (x) => (x < 0 ? negScale : posScale)(x, 0, maxExtent);
        legend.innerHTML = '<div id="grad" style="background-image: linear-gradient(to right, ' + negScale(-1, 0, 1) + ', ' + posScale(0, 0, 1) + ', ' + posScale(1, 0, 1) + ')"></div><span id="minval">' + dispN(info.min) + '</span><span id="midval">0</span><span id="maxval">' + dispN(info.max) + '</span>';
      }
    // Discrete values
    } else {
      colorScale = (x) => fixedPalette[(info.idx + info.values.indexOf(String(x))) % 10];
      legend.innerHTML = "<ul>" + info.values.map((x) =>
        '<li><div class="colorbox" style="background-color: ' + colorScale(x) + '"></div>' + x.replace(/^$/, '""') + ' (' + fmtN(info.valuesCount[x]) + ' node' + (info.valuesCount[x] > 1 ? 's' : '') + ')</li>'
      ).join("") + "</ul>"
    }
  }
  setTimeout(() => {
    let missing = 0;
    graph.forEachNode((node, attrs) => {
      if (attr !== "" && attrs[attr] === undefined)
        missing++;
      graph.mergeNodeAttributes(node, {
        color: attr !== "" && attrs[attr] === undefined ? "#CCC" : colorScale(attrs[attr])
      });
    });
    if (missing > 0)
      legend.innerHTML += '<div class="aligncenter">(' + fmtN(missing) + ' node' + (missing > 1 ? 's' : '') + ' with field missing)</div>';
    setTimeout(() => {
      renderer.refresh();
      document.getElementById("loader").style.display = "none";
    }, 10);
  }, 10);
}

document.getElementById('positions_file').addEventListener('change', (event) => {
  loadPositions(event.target.files[0]);
});
document.getElementById('edges_file').addEventListener('change', (event) => {
  loadEdges(event.target.files[0]);
});
document.getElementById('metadata_file').addEventListener('change', (event) => {
  loadMetadata(event.target.files[0]);
});
