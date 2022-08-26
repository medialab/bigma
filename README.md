# bigma

Spatialize huge graphs in CLI with [graphology](https://graphology.github.io/) then explore them on the web with [Sigma.js](https://www.sigmajs.org/).

## Install:

```bash
git clone https://github.com/medialab/bigma
cd bigma
npm install
```

## Spatialize a graph:

The script requires an edges CSV structured as `Souce,Target,Weight`.

```
# Run NB_FA2_ITERATIONS iterations with ForceAtlas2 and render PNG snapshots every NB_ITERATIONS_BETWEEN_MINIATURE_PNG_SNAPSHOTS:
node spatialize-network.js <EDGELIST_AS_SOURCE-TARGET-WEIGHT.CSV> <NB_FA2_ITERATIONS> <NB_ITERATIONS_BETWEEN_MINIATURE_PNG_SNAPSHOTS>

# The script can restart new iterations after a full run or a run interrupted by CTRL+C, using the positions CSV file dumped by the previous run (which should be named such as "ORIGINALFILE.CSV_positions_after_N_FA2Iterations.csv"):
node spatialize-network.js <ORIGINALFILE.CSV_positions_after_N_FA2Iterations.csv> <NB_EXTRA_FA2_ITERATIONS> <NB_ITERATIONS_BETWEEN_MINIATURE_PNG_SNAPSHOTS>

# Graphs are plotted by default with an identical size for all nodes, you can add an extra argument to use the nodes degrees as size:
node spatialize-network.js <EDGELIST_AS_SOURCE-TARGET-WEIGHT.CSV> <NB_FA2_ITERATIONS> <NB_ITERATIONS_BETWEEN_MINIATURE_PNG_SNAPSHOTS> 1

```

If you have [ImageMagick's convert](https://imagemagick.org/script/convert.php) tool installed, you can visualize the spatialization evolution as a gif by running:

```
./build_gif.sh <ORIGINAL_EDGELIST.CSV>
```

## Visualize the output on the web:

```bash
npm start
```

Then visit [http://localhost:3000/](http://localhost:3000/).

First load in the top-right box the positions CSV produced by the script, then the original edges file.
