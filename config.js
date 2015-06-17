System.config({
  "baseURL": "/",
  "transpiler": "traceur",
  "traceurOptions": {
    "annotations": true,
    "asyncFunctions": true
  },
  "paths": {
    "*": "src/*.js",
    "github:*": "jspm_packages/github/*.js",
    "npm:*": "jspm_packages/npm/*.js"
  }
});

System.config({
  "map": {
    "arva-utils": "github:Bizboard/arva-utils@master",
    "di.js": "github:Bizboard/di.js@master",
    "eventemitter3": "npm:eventemitter3@1.1.1",
    "firebase": "github:firebase/firebase-bower@2.2.7",
    "lodash": "npm:lodash@3.9.3",
    "traceur": "github:jmcriffey/bower-traceur@0.0.88",
    "traceur-runtime": "github:jmcriffey/bower-traceur-runtime@0.0.88",
    "github:Bizboard/arva-utils@master": {
      "fs": "github:jspm/nodelibs-fs@0.1.2",
      "lodash": "npm:lodash@3.9.3",
      "path": "github:jspm/nodelibs-path@0.1.0"
    },
    "github:jspm/nodelibs-path@0.1.0": {
      "path-browserify": "npm:path-browserify@0.0.0"
    },
    "github:jspm/nodelibs-process@0.1.1": {
      "process": "npm:process@0.10.1"
    },
    "npm:lodash@3.9.3": {
      "process": "github:jspm/nodelibs-process@0.1.1"
    },
    "npm:path-browserify@0.0.0": {
      "process": "github:jspm/nodelibs-process@0.1.1"
    }
  }
});

