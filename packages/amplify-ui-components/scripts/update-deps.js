/* eslint-disable */

const editJsonFile = require('edit-json-file');

const PACKAGE_JSON_DIR = `./package.json`;

const file = editJsonFile(PACKAGE_JSON_DIR);

file.set('dependencies.@aws-amplify/auth', '3.x.x');
file.set('dependencies.@aws-amplify/core', '3.x.x');
file.set('dependencies.@aws-amplify/storage', '3.x.x');
file.set('dependencies.@aws-amplify/interactions', '3.x.x');
file.set('dependencies.@aws-amplify/xr', '2.x.x');

file.save();
