System.config({
  "baseURL": "/",
  "paths": {
    "*": "src/*.js",
    "github:*": "jspm_packages/github/*.js",
    "npm:*": "jspm_packages/npm/*.js"
  }
});

System.config({
  "map": {
    "arva-context": "github:Bizboard/arva-context@master",
    "di.js": "github:angular/di.js@master",
    "eventemitter3": "npm:eventemitter3@1.1.0",
    "firebase": "github:firebase/firebase-bower@2.2.4",
    "lodash": "npm:lodash@3.7.0",
    "github:jspm/nodelibs-process@0.1.1": {
      "process": "npm:process@0.10.1"
    },
    "npm:lodash@3.7.0": {
      "process": "github:jspm/nodelibs-process@0.1.1"
    }
  }
});

