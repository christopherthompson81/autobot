/*
 * This script will automatically look at the closest entity.
 * It checks for a near entity every tick.
 */
'use strict';

const autoBot = require("./autoBot.js");

let botId = process.argv[2]

const myAutoBot = new autoBot(botId);
