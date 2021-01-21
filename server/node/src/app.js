'use strict'
require('dotenv').config()
const compression = require('compression');
const express = require('express');
const bodyParser = require('body-parser')
const rateLimit = require("express-rate-limit");
const cookieParser = require('cookie-parser')
const path = require('path');
const cors = require('cors');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
const app = express();
const port = 5001;
app.listen(port, () => console.log(`Server started on port ${port}`));
app.use(compression())
app.use(cookieParser());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', "*");  
  res.header('Access-Control-Allow-Headers', 'content-type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  next();
});
app.use(cors());
app.use(limiter);
app.use(express.json())
app.use(bodyParser.json({ limit: '10000kb' }));

module.exports = app;