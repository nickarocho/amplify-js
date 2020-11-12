/* eslint-disable */

const editJsonFile = require('edit-json-file');

const PACKAGE_JSON_DIR = `./package.json`;

const file = editJsonFile(PACKAGE_JSON_DIR);

file.set('dependencies.@aws-amplify/auth', '^3.0.0');
file.set('dependencies.@aws-amplify/core', '^3.0.0');
file.set('dependencies.@aws-amplify/storage', '^3.0.0');
file.set('dependencies.@aws-amplify/interactions', '^3.0.0');
file.set('dependencies.@aws-amplify/xr', '^2.0.0');

file.save();
