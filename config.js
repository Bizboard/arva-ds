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
    "eventemitter3": "npm:eventemitter3@1.1.0",
    "firebase": "github:firebase/firebase-bower@2.2.5",
    "lodash": "npm:lodash@3.9.1",
    "traceur": "github:jmcriffey/bower-traceur@0.0.88",
    "traceur-runtime": "github:jmcriffey/bower-traceur-runtime@0.0.88",
    "github:jspm/nodelibs-process@0.1.1": {
      "process": "npm:process@0.10.1"
    },
    "npm:lodash@3.9.1": {
      "process": "github:jspm/nodelibs-process@0.1.1"
    }
  }
});

