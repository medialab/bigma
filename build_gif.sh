#!/bin/bash

FILEROOT=$(echo $1 | sed 's/\.csv$//')

convert -delay 5 ${FILEROOT}_snapshot_*.png ${FILEROOT}.gif
