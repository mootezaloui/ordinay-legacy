"use strict";

const readTools = require("./read");

function getWave1ReadTools() {
  return readTools.getReadTools();
}

module.exports = {
  ...readTools,
  getWave1ReadTools,
};