(function(global) {

  var defined = {};

  // indexOf polyfill for IE8
  var indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++)
      if (this[i] === item)
        return i;
    return -1;
  }

  function dedupe(deps) {
    var newDeps = [];
    for (var i = 0, l = deps.length; i < l; i++)
      if (indexOf.call(newDeps, deps[i]) == -1)
        newDeps.push(deps[i])
    return newDeps;
  }

  function register(name, deps, declare) {
    if (arguments.length === 4)
      return registerDynamic.apply(this, arguments);
    doRegister(name, {
      declarative: true,
      deps: deps,
      declare: declare
    });
  }

  function registerDynamic(name, deps, executingRequire, execute) {
    doRegister(name, {
      declarative: false,
      deps: deps,
      executingRequire: executingRequire,
      execute: execute
    });
  }

  function doRegister(name, entry) {
    entry.name = name;

    // we never overwrite an existing define
    if (!(name in defined))
      defined[name] = entry; 

    entry.deps = dedupe(entry.deps);

    // we have to normalize dependencies
    // (assume dependencies are normalized for now)
    // entry.normalizedDeps = entry.deps.map(normalize);
    entry.normalizedDeps = entry.deps;
  }


  function buildGroups(entry, groups) {
    groups[entry.groupIndex] = groups[entry.groupIndex] || [];

    if (indexOf.call(groups[entry.groupIndex], entry) != -1)
      return;

    groups[entry.groupIndex].push(entry);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];

      // not in the registry means already linked / ES6
      if (!depEntry || depEntry.evaluated)
        continue;

      // now we know the entry is in our unlinked linkage group
      var depGroupIndex = entry.groupIndex + (depEntry.declarative != entry.declarative);

      // the group index of an entry is always the maximum
      if (depEntry.groupIndex === undefined || depEntry.groupIndex < depGroupIndex) {

        // if already in a group, remove from the old group
        if (depEntry.groupIndex !== undefined) {
          groups[depEntry.groupIndex].splice(indexOf.call(groups[depEntry.groupIndex], depEntry), 1);

          // if the old group is empty, then we have a mixed depndency cycle
          if (groups[depEntry.groupIndex].length == 0)
            throw new TypeError("Mixed dependency cycle detected");
        }

        depEntry.groupIndex = depGroupIndex;
      }

      buildGroups(depEntry, groups);
    }
  }

  function link(name) {
    var startEntry = defined[name];

    startEntry.groupIndex = 0;

    var groups = [];

    buildGroups(startEntry, groups);

    var curGroupDeclarative = !!startEntry.declarative == groups.length % 2;
    for (var i = groups.length - 1; i >= 0; i--) {
      var group = groups[i];
      for (var j = 0; j < group.length; j++) {
        var entry = group[j];

        // link each group
        if (curGroupDeclarative)
          linkDeclarativeModule(entry);
        else
          linkDynamicModule(entry);
      }
      curGroupDeclarative = !curGroupDeclarative; 
    }
  }

  // module binding records
  var moduleRecords = {};
  function getOrCreateModuleRecord(name) {
    return moduleRecords[name] || (moduleRecords[name] = {
      name: name,
      dependencies: [],
      exports: {}, // start from an empty module and extend
      importers: []
    })
  }

  function linkDeclarativeModule(entry) {
    // only link if already not already started linking (stops at circular)
    if (entry.module)
      return;

    var module = entry.module = getOrCreateModuleRecord(entry.name);
    var exports = entry.module.exports;

    var declaration = entry.declare.call(global, function(name, value) {
      module.locked = true;
      exports[name] = value;

      for (var i = 0, l = module.importers.length; i < l; i++) {
        var importerModule = module.importers[i];
        if (!importerModule.locked) {
          var importerIndex = indexOf.call(importerModule.dependencies, module);
          importerModule.setters[importerIndex](exports);
        }
      }

      module.locked = false;
      return value;
    });

    module.setters = declaration.setters;
    module.execute = declaration.execute;

    // now link all the module dependencies
    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];
      var depModule = moduleRecords[depName];

      // work out how to set depExports based on scenarios...
      var depExports;

      if (depModule) {
        depExports = depModule.exports;
      }
      else if (depEntry && !depEntry.declarative) {
        depExports = depEntry.esModule;
      }
      // in the module registry
      else if (!depEntry) {
        depExports = load(depName);
      }
      // we have an entry -> link
      else {
        linkDeclarativeModule(depEntry);
        depModule = depEntry.module;
        depExports = depModule.exports;
      }

      // only declarative modules have dynamic bindings
      if (depModule && depModule.importers) {
        depModule.importers.push(module);
        module.dependencies.push(depModule);
      }
      else
        module.dependencies.push(null);

      // run the setter for this dependency
      if (module.setters[i])
        module.setters[i](depExports);
    }
  }

  // An analog to loader.get covering execution of all three layers (real declarative, simulated declarative, simulated dynamic)
  function getModule(name) {
    var exports;
    var entry = defined[name];

    if (!entry) {
      exports = load(name);
      if (!exports)
        throw new Error("Unable to load dependency " + name + ".");
    }

    else {
      if (entry.declarative)
        ensureEvaluated(name, []);

      else if (!entry.evaluated)
        linkDynamicModule(entry);

      exports = entry.module.exports;
    }

    if ((!entry || entry.declarative) && exports && exports.__useDefault)
      return exports['default'];

    return exports;
  }

  function linkDynamicModule(entry) {
    if (entry.module)
      return;

    var exports = {};

    var module = entry.module = { exports: exports, id: entry.name };

    // AMD requires execute the tree first
    if (!entry.executingRequire) {
      for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
        var depName = entry.normalizedDeps[i];
        var depEntry = defined[depName];
        if (depEntry)
          linkDynamicModule(depEntry);
      }
    }

    // now execute
    entry.evaluated = true;
    var output = entry.execute.call(global, function(name) {
      for (var i = 0, l = entry.deps.length; i < l; i++) {
        if (entry.deps[i] != name)
          continue;
        return getModule(entry.normalizedDeps[i]);
      }
      throw new TypeError('Module ' + name + ' not declared as a dependency.');
    }, exports, module);

    if (output)
      module.exports = output;

    // create the esModule object, which allows ES6 named imports of dynamics
    exports = module.exports;
 
    if (exports && exports.__esModule) {
      entry.esModule = exports;
    }
    else {
      var hasOwnProperty = exports && exports.hasOwnProperty;
      entry.esModule = {};
      for (var p in exports) {
        if (!hasOwnProperty || exports.hasOwnProperty(p))
          entry.esModule[p] = exports[p];
      }
      entry.esModule['default'] = exports;
      entry.esModule.__useDefault = true;
    }
  }

  /*
   * Given a module, and the list of modules for this current branch,
   *  ensure that each of the dependencies of this module is evaluated
   *  (unless one is a circular dependency already in the list of seen
   *  modules, in which case we execute it)
   *
   * Then we evaluate the module itself depth-first left to right 
   * execution to match ES6 modules
   */
  function ensureEvaluated(moduleName, seen) {
    var entry = defined[moduleName];

    // if already seen, that means it's an already-evaluated non circular dependency
    if (!entry || entry.evaluated || !entry.declarative)
      return;

    // this only applies to declarative modules which late-execute

    seen.push(moduleName);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      if (indexOf.call(seen, depName) == -1) {
        if (!defined[depName])
          load(depName);
        else
          ensureEvaluated(depName, seen);
      }
    }

    if (entry.evaluated)
      return;

    entry.evaluated = true;
    entry.module.execute.call(global);
  }

  // magical execution function
  var modules = {};
  function load(name) {
    if (modules[name])
      return modules[name];

    var entry = defined[name];

    // first we check if this module has already been defined in the registry
    if (!entry)
      throw "Module " + name + " not present.";

    // recursively ensure that the module and all its 
    // dependencies are linked (with dependency group handling)
    link(name);

    // now handle dependency execution in correct order
    ensureEvaluated(name, []);

    // remove from the registry
    defined[name] = undefined;

    // return the defined module object
    return modules[name] = entry.declarative ? entry.module.exports : entry.esModule;
  };

  return function(mains, declare) {
    return function(formatDetect) {
      formatDetect(function() {
        var System = {
          _nodeRequire: typeof require != 'undefined' && require.resolve && typeof process != 'undefined' && require,
          register: register,
          registerDynamic: registerDynamic,
          get: load, 
          set: function(name, module) {
            modules[name] = module; 
          },
          newModule: function(module) {
            return module;
          },
          'import': function() {
            throw new TypeError('Dynamic System.import calls are not supported for SFX bundles. Rather use a named bundle.');
          }
        };
        System.set('@empty', {});

        declare(System);

        var firstLoad = load(mains[0]);
        if (mains.length > 1)
          for (var i = 1; i < mains.length; i++)
            load(mains[i]);

        return firstLoad;
      });
    };
  };

})(typeof self != 'undefined' ? self : global)
/* (['mainModule'], function(System) {
  System.register(...);
})
(function(factory) {
  if (typeof define && define.amd)
    define(factory);
  // etc UMD / module pattern
})*/

(['src/main.js'], function(System) {

(function(__global) {
  var hasOwnProperty = __global.hasOwnProperty;
  var indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++)
      if (this[i] === item)
        return i;
    return -1;
  }

  function readMemberExpression(p, value) {
    var pParts = p.split('.');
    while (pParts.length)
      value = value[pParts.shift()];
    return value;
  }

  // bare minimum ignores for IE8
  var ignoredGlobalProps = ['_g', 'sessionStorage', 'localStorage', 'clipboardData', 'frames', 'external'];

  var globalSnapshot;

  function forEachGlobal(callback) {
    if (Object.keys)
      Object.keys(__global).forEach(callback);
    else
      for (var g in __global) {
        if (!hasOwnProperty.call(__global, g))
          continue;
        callback(g);
      }
  }

  function forEachGlobalValue(callback) {
    forEachGlobal(function(globalName) {
      if (indexOf.call(ignoredGlobalProps, globalName) != -1)
        return;
      try {
        var value = __global[globalName];
      }
      catch (e) {
        ignoredGlobalProps.push(globalName);
      }
      callback(globalName, value);
    });
  }

  System.set('@@global-helpers', System.newModule({
    prepareGlobal: function(moduleName, exportName, globals) {
      // set globals
      var oldGlobals;
      if (globals) {
        oldGlobals = {};
        for (var g in globals) {
          oldGlobals[g] = globals[g];
          __global[g] = globals[g];
        }
      }

      // store a complete copy of the global object in order to detect changes
      if (!exportName) {
        globalSnapshot = {};

        forEachGlobalValue(function(name, value) {
          globalSnapshot[name] = value;
        });
      }

      // return function to retrieve global
      return function() {
        var globalValue;

        if (exportName) {
          globalValue = readMemberExpression(exportName, __global);
        }
        else {
          var singleGlobal;
          var multipleExports;
          var exports = {};

          forEachGlobalValue(function(name, value) {
            if (globalSnapshot[name] === value)
              return;
            if (typeof value == 'undefined')
              return;
            exports[name] = value;

            if (typeof singleGlobal != 'undefined') {
              if (!multipleExports && singleGlobal !== value)
                multipleExports = true;
            }
            else {
              singleGlobal = value;
            }
          });
          globalValue = multipleExports ? exports : singleGlobal;
        }

        // revert globals
        if (oldGlobals) {
          for (var g in oldGlobals)
            __global[g] = oldGlobals[g];
        }

        return globalValue;
      };
    }
  }));

})(typeof self != 'undefined' ? self : global);

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.fw.js", [], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function($) {
    $.FW = false;
    $.path = $.core;
    return $;
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/helpers/class-call-check.js", [], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  "use strict";
  exports["default"] = function(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  };
  exports.__esModule = true;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.def.js", ["npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      global = $.g,
      core = $.core,
      isFunction = $.isFunction;
  function ctx(fn, that) {
    return function() {
      return fn.apply(that, arguments);
    };
  }
  $def.F = 1;
  $def.G = 2;
  $def.S = 4;
  $def.P = 8;
  $def.B = 16;
  $def.W = 32;
  function $def(type, name, source) {
    var key,
        own,
        out,
        exp,
        isGlobal = type & $def.G,
        isProto = type & $def.P,
        target = isGlobal ? global : type & $def.S ? global[name] : (global[name] || {}).prototype,
        exports = isGlobal ? core : core[name] || (core[name] = {});
    if (isGlobal)
      source = name;
    for (key in source) {
      own = !(type & $def.F) && target && key in target;
      if (own && key in exports)
        continue;
      out = own ? target[key] : source[key];
      if (isGlobal && !isFunction(target[key]))
        exp = source[key];
      else if (type & $def.B && own)
        exp = ctx(out, global);
      else if (type & $def.W && target[key] == out)
        !function(C) {
          exp = function(param) {
            return this instanceof C ? new C(param) : C(param);
          };
          exp.prototype = C.prototype;
        }(out);
      else
        exp = isProto && isFunction(out) ? ctx(Function.call, out) : out;
      exports[key] = exp;
      if (isProto)
        (exports.prototype || (exports.prototype = {}))[key] = out;
    }
  }
  module.exports = $def;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.get-names.js", ["npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      toString = {}.toString,
      getNames = $.getNames;
  var windowNames = typeof window == 'object' && Object.getOwnPropertyNames ? Object.getOwnPropertyNames(window) : [];
  function getWindowNames(it) {
    try {
      return getNames(it);
    } catch (e) {
      return windowNames.slice();
    }
  }
  module.exports.get = function getOwnPropertyNames(it) {
    if (windowNames && toString.call(it) == '[object Window]')
      return getWindowNames(it);
    return getNames($.toObject(it));
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/fn/object/create.js", ["npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js");
  module.exports = function create(P, D) {
    return $.create(P, D);
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.assert.js", ["npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js");
  function assert(condition, msg1, msg2) {
    if (!condition)
      throw TypeError(msg2 ? msg1 + msg2 : msg1);
  }
  assert.def = $.assertDefined;
  assert.fn = function(it) {
    if (!$.isFunction(it))
      throw TypeError(it + ' is not a function!');
    return it;
  };
  assert.obj = function(it) {
    if (!$.isObject(it))
      throw TypeError(it + ' is not an object!');
    return it;
  };
  assert.inst = function(it, Constructor, name) {
    if (!(it instanceof Constructor))
      throw TypeError(name + ": use the 'new' operator!");
    return it;
  };
  module.exports = assert;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.ctx.js", ["npm:core-js@0.9.18/library/modules/$.assert.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var assertFunction = require("npm:core-js@0.9.18/library/modules/$.assert.js").fn;
  module.exports = function(fn, that, length) {
    assertFunction(fn);
    if (~length && that === undefined)
      return fn;
    switch (length) {
      case 1:
        return function(a) {
          return fn.call(that, a);
        };
      case 2:
        return function(a, b) {
          return fn.call(that, a, b);
        };
      case 3:
        return function(a, b, c) {
          return fn.call(that, a, b, c);
        };
    }
    return function() {
      return fn.apply(that, arguments);
    };
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/fn/object/get-own-property-names.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/es6.object.statics-accept-primitives.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js");
  require("npm:core-js@0.9.18/library/modules/es6.object.statics-accept-primitives.js");
  module.exports = function getOwnPropertyNames(it) {
    return $.getNames(it);
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.unscope.js", [], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function() {};
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.uid.js", ["npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var sid = 0;
  function uid(key) {
    return 'Symbol('.concat(key === undefined ? '' : key, ')_', (++sid + Math.random()).toString(36));
  }
  uid.safe = require("npm:core-js@0.9.18/library/modules/$.js").g.Symbol || uid;
  module.exports = uid;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.shared.js", ["npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      SHARED = '__core-js_shared__',
      store = $.g[SHARED] || ($.g[SHARED] = {});
  module.exports = function(key) {
    return store[key] || (store[key] = {});
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.redef.js", ["npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = require("npm:core-js@0.9.18/library/modules/$.js").hide;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.string-at.js", ["npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js");
  module.exports = function(TO_STRING) {
    return function(that, pos) {
      var s = String($.assertDefined(that)),
          i = $.toInteger(pos),
          l = s.length,
          a,
          b;
      if (i < 0 || i >= l)
        return TO_STRING ? '' : undefined;
      a = s.charCodeAt(i);
      return a < 0xd800 || a > 0xdbff || i + 1 === l || (b = s.charCodeAt(i + 1)) < 0xdc00 || b > 0xdfff ? TO_STRING ? s.charAt(i) : a : TO_STRING ? s.slice(i, i + 2) : (a - 0xd800 << 10) + (b - 0xdc00) + 0x10000;
    };
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/core.iter-helpers.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.iter.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var core = require("npm:core-js@0.9.18/library/modules/$.js").core,
      $iter = require("npm:core-js@0.9.18/library/modules/$.iter.js");
  core.isIterable = $iter.is;
  core.getIterator = $iter.get;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:process@0.11.2/browser.js", [], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var process = module.exports = {};
  var queue = [];
  var draining = false;
  var currentQueue;
  var queueIndex = -1;
  function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
      queue = currentQueue.concat(queue);
    } else {
      queueIndex = -1;
    }
    if (queue.length) {
      drainQueue();
    }
  }
  function drainQueue() {
    if (draining) {
      return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;
    var len = queue.length;
    while (len) {
      currentQueue = queue;
      queue = [];
      while (++queueIndex < len) {
        if (currentQueue) {
          currentQueue[queueIndex].run();
        }
      }
      queueIndex = -1;
      len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
  }
  process.nextTick = function(fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
      for (var i = 1; i < arguments.length; i++) {
        args[i - 1] = arguments[i];
      }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
      setTimeout(drainQueue, 0);
    }
  };
  function Item(fun, array) {
    this.fun = fun;
    this.array = array;
  }
  Item.prototype.run = function() {
    this.fun.apply(null, this.array);
  };
  process.title = 'browser';
  process.browser = true;
  process.env = {};
  process.argv = [];
  process.version = '';
  process.versions = {};
  function noop() {}
  process.on = noop;
  process.addListener = noop;
  process.once = noop;
  process.off = noop;
  process.removeListener = noop;
  process.removeAllListeners = noop;
  process.emit = noop;
  process.binding = function(name) {
    throw new Error('process.binding is not supported');
  };
  process.cwd = function() {
    return '/';
  };
  process.chdir = function(dir) {
    throw new Error('process.chdir is not supported');
  };
  process.umask = function() {
    return 0;
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/es6.object.to-string.js", ["npm:core-js@0.9.18/library/modules/$.cof.js", "npm:core-js@0.9.18/library/modules/$.wks.js", "npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.redef.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var cof = require("npm:core-js@0.9.18/library/modules/$.cof.js"),
      tmp = {};
  tmp[require("npm:core-js@0.9.18/library/modules/$.wks.js")('toStringTag')] = 'z';
  if (require("npm:core-js@0.9.18/library/modules/$.js").FW && cof(tmp) != 'z') {
    require("npm:core-js@0.9.18/library/modules/$.redef.js")(Object.prototype, 'toString', function toString() {
      return '[object ' + cof.classof(this) + ']';
    }, true);
  }
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.iter-call.js", ["npm:core-js@0.9.18/library/modules/$.assert.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var assertObject = require("npm:core-js@0.9.18/library/modules/$.assert.js").obj;
  function close(iterator) {
    var ret = iterator['return'];
    if (ret !== undefined)
      assertObject(ret.call(iterator));
  }
  function call(iterator, fn, value, entries) {
    try {
      return entries ? fn(assertObject(value)[0], value[1]) : fn(value);
    } catch (e) {
      close(iterator);
      throw e;
    }
  }
  call.close = close;
  module.exports = call;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.mix.js", ["npm:core-js@0.9.18/library/modules/$.redef.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $redef = require("npm:core-js@0.9.18/library/modules/$.redef.js");
  module.exports = function(target, src) {
    for (var key in src)
      $redef(target, key, src[key]);
    return target;
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.species.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.wks.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      SPECIES = require("npm:core-js@0.9.18/library/modules/$.wks.js")('species');
  module.exports = function(C) {
    if ($.DESC && !(SPECIES in C))
      $.setDesc(C, SPECIES, {
        configurable: true,
        get: $.that
      });
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.collection-to-json.js", ["npm:core-js@0.9.18/library/modules/$.def.js", "npm:core-js@0.9.18/library/modules/$.for-of.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.18/library/modules/$.def.js"),
      forOf = require("npm:core-js@0.9.18/library/modules/$.for-of.js");
  module.exports = function(NAME) {
    $def($def.P, NAME, {toJSON: function toJSON() {
        var arr = [];
        forOf(this, false, arr.push, arr);
        return arr;
      }});
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.same.js", [], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = Object.is || function is(x, y) {
    return x === y ? x !== 0 || 1 / x === 1 / y : x != x && y != y;
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.invoke.js", [], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(fn, args, that) {
    var un = that === undefined;
    switch (args.length) {
      case 0:
        return un ? fn() : fn.call(that);
      case 1:
        return un ? fn(args[0]) : fn.call(that, args[0]);
      case 2:
        return un ? fn(args[0], args[1]) : fn.call(that, args[0], args[1]);
      case 3:
        return un ? fn(args[0], args[1], args[2]) : fn.call(that, args[0], args[1], args[2]);
      case 4:
        return un ? fn(args[0], args[1], args[2], args[3]) : fn.call(that, args[0], args[1], args[2], args[3]);
      case 5:
        return un ? fn(args[0], args[1], args[2], args[3], args[4]) : fn.call(that, args[0], args[1], args[2], args[3], args[4]);
    }
    return fn.apply(that, args);
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.dom-create.js", ["npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      document = $.g.document,
      isObject = $.isObject,
      is = isObject(document) && isObject(document.createElement);
  module.exports = function(it) {
    return is ? document.createElement(it) : {};
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.iter-detect.js", ["npm:core-js@0.9.18/library/modules/$.wks.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var SYMBOL_ITERATOR = require("npm:core-js@0.9.18/library/modules/$.wks.js")('iterator'),
      SAFE_CLOSING = false;
  try {
    var riter = [7][SYMBOL_ITERATOR]();
    riter['return'] = function() {
      SAFE_CLOSING = true;
    };
    Array.from(riter, function() {
      throw 2;
    });
  } catch (e) {}
  module.exports = function(exec) {
    if (!SAFE_CLOSING)
      return false;
    var safe = false;
    try {
      var arr = [7],
          iter = arr[SYMBOL_ITERATOR]();
      iter.next = function() {
        safe = true;
      };
      arr[SYMBOL_ITERATOR] = function() {
        return iter;
      };
      exec(arr);
    } catch (e) {}
    return safe;
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/helpers/bind.js", [], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  "use strict";
  exports["default"] = Function.prototype.bind;
  exports.__esModule = true;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.own-keys.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.assert.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      assertObject = require("npm:core-js@0.9.18/library/modules/$.assert.js").obj;
  module.exports = function ownKeys(it) {
    assertObject(it);
    var keys = $.getNames(it),
        getSymbols = $.getSymbols;
    return getSymbols ? keys.concat(getSymbols(it)) : keys;
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.keyof.js", ["npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js");
  module.exports = function(object, el) {
    var O = $.toObject(object),
        keys = $.getKeys(O),
        length = keys.length,
        index = 0,
        key;
    while (length > index)
      if (O[key = keys[index++]] === el)
        return key;
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.enum-keys.js", ["npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js");
  module.exports = function(it) {
    var keys = $.getKeys(it),
        getDesc = $.getDesc,
        getSymbols = $.getSymbols;
    if (getSymbols)
      $.each.call(getSymbols(it), function(key) {
        if (getDesc(it, key).enumerable)
          keys.push(key);
      });
    return keys;
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/fn/object/keys.js", ["npm:core-js@0.9.18/library/modules/es6.object.statics-accept-primitives.js", "npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.18/library/modules/es6.object.statics-accept-primitives.js");
  module.exports = require("npm:core-js@0.9.18/library/modules/$.js").core.Object.keys;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:eventemitter3@1.1.1/index.js", [], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var prefix = typeof Object.create !== 'function' ? '~' : false;
  function EE(fn, context, once) {
    this.fn = fn;
    this.context = context;
    this.once = once || false;
  }
  function EventEmitter() {}
  EventEmitter.prototype._events = undefined;
  EventEmitter.prototype.listeners = function listeners(event, exists) {
    var evt = prefix ? prefix + event : event,
        available = this._events && this._events[evt];
    if (exists)
      return !!available;
    if (!available)
      return [];
    if (available.fn)
      return [available.fn];
    for (var i = 0,
        l = available.length,
        ee = new Array(l); i < l; i++) {
      ee[i] = available[i].fn;
    }
    return ee;
  };
  EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
    var evt = prefix ? prefix + event : event;
    if (!this._events || !this._events[evt])
      return false;
    var listeners = this._events[evt],
        len = arguments.length,
        args,
        i;
    if ('function' === typeof listeners.fn) {
      if (listeners.once)
        this.removeListener(event, listeners.fn, undefined, true);
      switch (len) {
        case 1:
          return listeners.fn.call(listeners.context), true;
        case 2:
          return listeners.fn.call(listeners.context, a1), true;
        case 3:
          return listeners.fn.call(listeners.context, a1, a2), true;
        case 4:
          return listeners.fn.call(listeners.context, a1, a2, a3), true;
        case 5:
          return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
        case 6:
          return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
      }
      for (i = 1, args = new Array(len - 1); i < len; i++) {
        args[i - 1] = arguments[i];
      }
      listeners.fn.apply(listeners.context, args);
    } else {
      var length = listeners.length,
          j;
      for (i = 0; i < length; i++) {
        if (listeners[i].once)
          this.removeListener(event, listeners[i].fn, undefined, true);
        switch (len) {
          case 1:
            listeners[i].fn.call(listeners[i].context);
            break;
          case 2:
            listeners[i].fn.call(listeners[i].context, a1);
            break;
          case 3:
            listeners[i].fn.call(listeners[i].context, a1, a2);
            break;
          default:
            if (!args)
              for (j = 1, args = new Array(len - 1); j < len; j++) {
                args[j - 1] = arguments[j];
              }
            listeners[i].fn.apply(listeners[i].context, args);
        }
      }
    }
    return true;
  };
  EventEmitter.prototype.on = function on(event, fn, context) {
    var listener = new EE(fn, context || this),
        evt = prefix ? prefix + event : event;
    if (!this._events)
      this._events = prefix ? {} : Object.create(null);
    if (!this._events[evt])
      this._events[evt] = listener;
    else {
      if (!this._events[evt].fn)
        this._events[evt].push(listener);
      else
        this._events[evt] = [this._events[evt], listener];
    }
    return this;
  };
  EventEmitter.prototype.once = function once(event, fn, context) {
    var listener = new EE(fn, context || this, true),
        evt = prefix ? prefix + event : event;
    if (!this._events)
      this._events = prefix ? {} : Object.create(null);
    if (!this._events[evt])
      this._events[evt] = listener;
    else {
      if (!this._events[evt].fn)
        this._events[evt].push(listener);
      else
        this._events[evt] = [this._events[evt], listener];
    }
    return this;
  };
  EventEmitter.prototype.removeListener = function removeListener(event, fn, context, once) {
    var evt = prefix ? prefix + event : event;
    if (!this._events || !this._events[evt])
      return this;
    var listeners = this._events[evt],
        events = [];
    if (fn) {
      if (listeners.fn) {
        if (listeners.fn !== fn || (once && !listeners.once) || (context && listeners.context !== context)) {
          events.push(listeners);
        }
      } else {
        for (var i = 0,
            length = listeners.length; i < length; i++) {
          if (listeners[i].fn !== fn || (once && !listeners[i].once) || (context && listeners[i].context !== context)) {
            events.push(listeners[i]);
          }
        }
      }
    }
    if (events.length) {
      this._events[evt] = events.length === 1 ? events[0] : events;
    } else {
      delete this._events[evt];
    }
    return this;
  };
  EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
    if (!this._events)
      return this;
    if (event)
      delete this._events[prefix ? prefix + event : event];
    else
      this._events = prefix ? {} : Object.create(null);
    return this;
  };
  EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
  EventEmitter.prototype.addListener = EventEmitter.prototype.on;
  EventEmitter.prototype.setMaxListeners = function setMaxListeners() {
    return this;
  };
  EventEmitter.prefixed = prefix;
  if ('undefined' !== typeof module) {
    module.exports = EventEmitter;
  }
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/helpers/slice.js", [], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  "use strict";
  exports["default"] = Array.prototype.slice;
  exports.__esModule = true;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("github:firebase/firebase-bower@2.3.1/firebase.js", [], false, function(__require, __exports, __module) {
  var _retrieveGlobal = System.get("@@global-helpers").prepareGlobal(__module.id, null, null);
  (function() {
    (function() {
      var g,
          aa = this;
      function n(a) {
        return void 0 !== a;
      }
      function ba() {}
      function ca(a) {
        a.ub = function() {
          return a.uf ? a.uf : a.uf = new a;
        };
      }
      function da(a) {
        var b = typeof a;
        if ("object" == b)
          if (a) {
            if (a instanceof Array)
              return "array";
            if (a instanceof Object)
              return b;
            var c = Object.prototype.toString.call(a);
            if ("[object Window]" == c)
              return "object";
            if ("[object Array]" == c || "number" == typeof a.length && "undefined" != typeof a.splice && "undefined" != typeof a.propertyIsEnumerable && !a.propertyIsEnumerable("splice"))
              return "array";
            if ("[object Function]" == c || "undefined" != typeof a.call && "undefined" != typeof a.propertyIsEnumerable && !a.propertyIsEnumerable("call"))
              return "function";
          } else
            return "null";
        else if ("function" == b && "undefined" == typeof a.call)
          return "object";
        return b;
      }
      function ea(a) {
        return "array" == da(a);
      }
      function fa(a) {
        var b = da(a);
        return "array" == b || "object" == b && "number" == typeof a.length;
      }
      function p(a) {
        return "string" == typeof a;
      }
      function ga(a) {
        return "number" == typeof a;
      }
      function ha(a) {
        return "function" == da(a);
      }
      function ia(a) {
        var b = typeof a;
        return "object" == b && null != a || "function" == b;
      }
      function ja(a, b, c) {
        return a.call.apply(a.bind, arguments);
      }
      function ka(a, b, c) {
        if (!a)
          throw Error();
        if (2 < arguments.length) {
          var d = Array.prototype.slice.call(arguments, 2);
          return function() {
            var c = Array.prototype.slice.call(arguments);
            Array.prototype.unshift.apply(c, d);
            return a.apply(b, c);
          };
        }
        return function() {
          return a.apply(b, arguments);
        };
      }
      function q(a, b, c) {
        q = Function.prototype.bind && -1 != Function.prototype.bind.toString().indexOf("native code") ? ja : ka;
        return q.apply(null, arguments);
      }
      var la = Date.now || function() {
        return +new Date;
      };
      function ma(a, b) {
        function c() {}
        c.prototype = b.prototype;
        a.bh = b.prototype;
        a.prototype = new c;
        a.prototype.constructor = a;
        a.Yg = function(a, c, f) {
          for (var h = Array(arguments.length - 2),
              k = 2; k < arguments.length; k++)
            h[k - 2] = arguments[k];
          return b.prototype[c].apply(a, h);
        };
      }
      ;
      function r(a, b) {
        for (var c in a)
          b.call(void 0, a[c], c, a);
      }
      function na(a, b) {
        var c = {},
            d;
        for (d in a)
          c[d] = b.call(void 0, a[d], d, a);
        return c;
      }
      function oa(a, b) {
        for (var c in a)
          if (!b.call(void 0, a[c], c, a))
            return !1;
        return !0;
      }
      function pa(a) {
        var b = 0,
            c;
        for (c in a)
          b++;
        return b;
      }
      function qa(a) {
        for (var b in a)
          return b;
      }
      function ra(a) {
        var b = [],
            c = 0,
            d;
        for (d in a)
          b[c++] = a[d];
        return b;
      }
      function sa(a) {
        var b = [],
            c = 0,
            d;
        for (d in a)
          b[c++] = d;
        return b;
      }
      function ta(a, b) {
        for (var c in a)
          if (a[c] == b)
            return !0;
        return !1;
      }
      function ua(a, b, c) {
        for (var d in a)
          if (b.call(c, a[d], d, a))
            return d;
      }
      function va(a, b) {
        var c = ua(a, b, void 0);
        return c && a[c];
      }
      function wa(a) {
        for (var b in a)
          return !1;
        return !0;
      }
      function xa(a) {
        var b = {},
            c;
        for (c in a)
          b[c] = a[c];
        return b;
      }
      var ya = "constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString toString valueOf".split(" ");
      function za(a, b) {
        for (var c,
            d,
            e = 1; e < arguments.length; e++) {
          d = arguments[e];
          for (c in d)
            a[c] = d[c];
          for (var f = 0; f < ya.length; f++)
            c = ya[f], Object.prototype.hasOwnProperty.call(d, c) && (a[c] = d[c]);
        }
      }
      ;
      function Aa(a) {
        a = String(a);
        if (/^\s*$/.test(a) ? 0 : /^[\],:{}\s\u2028\u2029]*$/.test(a.replace(/\\["\\\/bfnrtu]/g, "@").replace(/"[^"\\\n\r\u2028\u2029\x00-\x08\x0a-\x1f]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "]").replace(/(?:^|:|,)(?:[\s\u2028\u2029]*\[)+/g, "")))
          try {
            return eval("(" + a + ")");
          } catch (b) {}
        throw Error("Invalid JSON string: " + a);
      }
      function Ba() {
        this.Sd = void 0;
      }
      function Ca(a, b, c) {
        switch (typeof b) {
          case "string":
            Da(b, c);
            break;
          case "number":
            c.push(isFinite(b) && !isNaN(b) ? b : "null");
            break;
          case "boolean":
            c.push(b);
            break;
          case "undefined":
            c.push("null");
            break;
          case "object":
            if (null == b) {
              c.push("null");
              break;
            }
            if (ea(b)) {
              var d = b.length;
              c.push("[");
              for (var e = "",
                  f = 0; f < d; f++)
                c.push(e), e = b[f], Ca(a, a.Sd ? a.Sd.call(b, String(f), e) : e, c), e = ",";
              c.push("]");
              break;
            }
            c.push("{");
            d = "";
            for (f in b)
              Object.prototype.hasOwnProperty.call(b, f) && (e = b[f], "function" != typeof e && (c.push(d), Da(f, c), c.push(":"), Ca(a, a.Sd ? a.Sd.call(b, f, e) : e, c), d = ","));
            c.push("}");
            break;
          case "function":
            break;
          default:
            throw Error("Unknown type: " + typeof b);
        }
      }
      var Ea = {
        '"': '\\"',
        "\\": "\\\\",
        "/": "\\/",
        "\b": "\\b",
        "\f": "\\f",
        "\n": "\\n",
        "\r": "\\r",
        "\t": "\\t",
        "\x0B": "\\u000b"
      },
          Fa = /\uffff/.test("\uffff") ? /[\\\"\x00-\x1f\x7f-\uffff]/g : /[\\\"\x00-\x1f\x7f-\xff]/g;
      function Da(a, b) {
        b.push('"', a.replace(Fa, function(a) {
          if (a in Ea)
            return Ea[a];
          var b = a.charCodeAt(0),
              e = "\\u";
          16 > b ? e += "000" : 256 > b ? e += "00" : 4096 > b && (e += "0");
          return Ea[a] = e + b.toString(16);
        }), '"');
      }
      ;
      function Ga() {
        return Math.floor(2147483648 * Math.random()).toString(36) + Math.abs(Math.floor(2147483648 * Math.random()) ^ la()).toString(36);
      }
      ;
      var Ha;
      a: {
        var Ia = aa.navigator;
        if (Ia) {
          var Ja = Ia.userAgent;
          if (Ja) {
            Ha = Ja;
            break a;
          }
        }
        Ha = "";
      }
      ;
      function Ka() {
        this.Va = -1;
      }
      ;
      function La() {
        this.Va = -1;
        this.Va = 64;
        this.N = [];
        this.me = [];
        this.Wf = [];
        this.Ld = [];
        this.Ld[0] = 128;
        for (var a = 1; a < this.Va; ++a)
          this.Ld[a] = 0;
        this.de = this.ac = 0;
        this.reset();
      }
      ma(La, Ka);
      La.prototype.reset = function() {
        this.N[0] = 1732584193;
        this.N[1] = 4023233417;
        this.N[2] = 2562383102;
        this.N[3] = 271733878;
        this.N[4] = 3285377520;
        this.de = this.ac = 0;
      };
      function Ma(a, b, c) {
        c || (c = 0);
        var d = a.Wf;
        if (p(b))
          for (var e = 0; 16 > e; e++)
            d[e] = b.charCodeAt(c) << 24 | b.charCodeAt(c + 1) << 16 | b.charCodeAt(c + 2) << 8 | b.charCodeAt(c + 3), c += 4;
        else
          for (e = 0; 16 > e; e++)
            d[e] = b[c] << 24 | b[c + 1] << 16 | b[c + 2] << 8 | b[c + 3], c += 4;
        for (e = 16; 80 > e; e++) {
          var f = d[e - 3] ^ d[e - 8] ^ d[e - 14] ^ d[e - 16];
          d[e] = (f << 1 | f >>> 31) & 4294967295;
        }
        b = a.N[0];
        c = a.N[1];
        for (var h = a.N[2],
            k = a.N[3],
            l = a.N[4],
            m,
            e = 0; 80 > e; e++)
          40 > e ? 20 > e ? (f = k ^ c & (h ^ k), m = 1518500249) : (f = c ^ h ^ k, m = 1859775393) : 60 > e ? (f = c & h | k & (c | h), m = 2400959708) : (f = c ^ h ^ k, m = 3395469782), f = (b << 5 | b >>> 27) + f + l + m + d[e] & 4294967295, l = k, k = h, h = (c << 30 | c >>> 2) & 4294967295, c = b, b = f;
        a.N[0] = a.N[0] + b & 4294967295;
        a.N[1] = a.N[1] + c & 4294967295;
        a.N[2] = a.N[2] + h & 4294967295;
        a.N[3] = a.N[3] + k & 4294967295;
        a.N[4] = a.N[4] + l & 4294967295;
      }
      La.prototype.update = function(a, b) {
        if (null != a) {
          n(b) || (b = a.length);
          for (var c = b - this.Va,
              d = 0,
              e = this.me,
              f = this.ac; d < b; ) {
            if (0 == f)
              for (; d <= c; )
                Ma(this, a, d), d += this.Va;
            if (p(a))
              for (; d < b; ) {
                if (e[f] = a.charCodeAt(d), ++f, ++d, f == this.Va) {
                  Ma(this, e);
                  f = 0;
                  break;
                }
              }
            else
              for (; d < b; )
                if (e[f] = a[d], ++f, ++d, f == this.Va) {
                  Ma(this, e);
                  f = 0;
                  break;
                }
          }
          this.ac = f;
          this.de += b;
        }
      };
      var u = Array.prototype,
          Na = u.indexOf ? function(a, b, c) {
            return u.indexOf.call(a, b, c);
          } : function(a, b, c) {
            c = null == c ? 0 : 0 > c ? Math.max(0, a.length + c) : c;
            if (p(a))
              return p(b) && 1 == b.length ? a.indexOf(b, c) : -1;
            for (; c < a.length; c++)
              if (c in a && a[c] === b)
                return c;
            return -1;
          },
          Oa = u.forEach ? function(a, b, c) {
            u.forEach.call(a, b, c);
          } : function(a, b, c) {
            for (var d = a.length,
                e = p(a) ? a.split("") : a,
                f = 0; f < d; f++)
              f in e && b.call(c, e[f], f, a);
          },
          Pa = u.filter ? function(a, b, c) {
            return u.filter.call(a, b, c);
          } : function(a, b, c) {
            for (var d = a.length,
                e = [],
                f = 0,
                h = p(a) ? a.split("") : a,
                k = 0; k < d; k++)
              if (k in h) {
                var l = h[k];
                b.call(c, l, k, a) && (e[f++] = l);
              }
            return e;
          },
          Qa = u.map ? function(a, b, c) {
            return u.map.call(a, b, c);
          } : function(a, b, c) {
            for (var d = a.length,
                e = Array(d),
                f = p(a) ? a.split("") : a,
                h = 0; h < d; h++)
              h in f && (e[h] = b.call(c, f[h], h, a));
            return e;
          },
          Ra = u.reduce ? function(a, b, c, d) {
            for (var e = [],
                f = 1,
                h = arguments.length; f < h; f++)
              e.push(arguments[f]);
            d && (e[0] = q(b, d));
            return u.reduce.apply(a, e);
          } : function(a, b, c, d) {
            var e = c;
            Oa(a, function(c, h) {
              e = b.call(d, e, c, h, a);
            });
            return e;
          },
          Sa = u.every ? function(a, b, c) {
            return u.every.call(a, b, c);
          } : function(a, b, c) {
            for (var d = a.length,
                e = p(a) ? a.split("") : a,
                f = 0; f < d; f++)
              if (f in e && !b.call(c, e[f], f, a))
                return !1;
            return !0;
          };
      function Ta(a, b) {
        var c = Ua(a, b, void 0);
        return 0 > c ? null : p(a) ? a.charAt(c) : a[c];
      }
      function Ua(a, b, c) {
        for (var d = a.length,
            e = p(a) ? a.split("") : a,
            f = 0; f < d; f++)
          if (f in e && b.call(c, e[f], f, a))
            return f;
        return -1;
      }
      function Va(a, b) {
        var c = Na(a, b);
        0 <= c && u.splice.call(a, c, 1);
      }
      function Wa(a, b, c) {
        return 2 >= arguments.length ? u.slice.call(a, b) : u.slice.call(a, b, c);
      }
      function Xa(a, b) {
        a.sort(b || Ya);
      }
      function Ya(a, b) {
        return a > b ? 1 : a < b ? -1 : 0;
      }
      ;
      var Za = -1 != Ha.indexOf("Opera") || -1 != Ha.indexOf("OPR"),
          $a = -1 != Ha.indexOf("Trident") || -1 != Ha.indexOf("MSIE"),
          ab = -1 != Ha.indexOf("Gecko") && -1 == Ha.toLowerCase().indexOf("webkit") && !(-1 != Ha.indexOf("Trident") || -1 != Ha.indexOf("MSIE")),
          bb = -1 != Ha.toLowerCase().indexOf("webkit");
      (function() {
        var a = "",
            b;
        if (Za && aa.opera)
          return a = aa.opera.version, ha(a) ? a() : a;
        ab ? b = /rv\:([^\);]+)(\)|;)/ : $a ? b = /\b(?:MSIE|rv)[: ]([^\);]+)(\)|;)/ : bb && (b = /WebKit\/(\S+)/);
        b && (a = (a = b.exec(Ha)) ? a[1] : "");
        return $a && (b = (b = aa.document) ? b.documentMode : void 0, b > parseFloat(a)) ? String(b) : a;
      })();
      var cb = null,
          db = null,
          eb = null;
      function fb(a, b) {
        if (!fa(a))
          throw Error("encodeByteArray takes an array as a parameter");
        gb();
        for (var c = b ? db : cb,
            d = [],
            e = 0; e < a.length; e += 3) {
          var f = a[e],
              h = e + 1 < a.length,
              k = h ? a[e + 1] : 0,
              l = e + 2 < a.length,
              m = l ? a[e + 2] : 0,
              t = f >> 2,
              f = (f & 3) << 4 | k >> 4,
              k = (k & 15) << 2 | m >> 6,
              m = m & 63;
          l || (m = 64, h || (k = 64));
          d.push(c[t], c[f], c[k], c[m]);
        }
        return d.join("");
      }
      function gb() {
        if (!cb) {
          cb = {};
          db = {};
          eb = {};
          for (var a = 0; 65 > a; a++)
            cb[a] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".charAt(a), db[a] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.".charAt(a), eb[db[a]] = a, 62 <= a && (eb["ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".charAt(a)] = a);
        }
      }
      ;
      var hb = hb || "2.3.1";
      function v(a, b) {
        return Object.prototype.hasOwnProperty.call(a, b);
      }
      function w(a, b) {
        if (Object.prototype.hasOwnProperty.call(a, b))
          return a[b];
      }
      function ib(a, b) {
        for (var c in a)
          Object.prototype.hasOwnProperty.call(a, c) && b(c, a[c]);
      }
      function jb(a) {
        var b = {};
        ib(a, function(a, d) {
          b[a] = d;
        });
        return b;
      }
      ;
      function kb(a) {
        var b = [];
        ib(a, function(a, d) {
          ea(d) ? Oa(d, function(d) {
            b.push(encodeURIComponent(a) + "=" + encodeURIComponent(d));
          }) : b.push(encodeURIComponent(a) + "=" + encodeURIComponent(d));
        });
        return b.length ? "&" + b.join("&") : "";
      }
      function lb(a) {
        var b = {};
        a = a.replace(/^\?/, "").split("&");
        Oa(a, function(a) {
          a && (a = a.split("="), b[a[0]] = a[1]);
        });
        return b;
      }
      ;
      function x(a, b, c, d) {
        var e;
        d < b ? e = "at least " + b : d > c && (e = 0 === c ? "none" : "no more than " + c);
        if (e)
          throw Error(a + " failed: Was called with " + d + (1 === d ? " argument." : " arguments.") + " Expects " + e + ".");
      }
      function y(a, b, c) {
        var d = "";
        switch (b) {
          case 1:
            d = c ? "first" : "First";
            break;
          case 2:
            d = c ? "second" : "Second";
            break;
          case 3:
            d = c ? "third" : "Third";
            break;
          case 4:
            d = c ? "fourth" : "Fourth";
            break;
          default:
            throw Error("errorPrefix called with argumentNumber > 4.  Need to update it?");
        }
        return a = a + " failed: " + (d + " argument ");
      }
      function A(a, b, c, d) {
        if ((!d || n(c)) && !ha(c))
          throw Error(y(a, b, d) + "must be a valid function.");
      }
      function mb(a, b, c) {
        if (n(c) && (!ia(c) || null === c))
          throw Error(y(a, b, !0) + "must be a valid context object.");
      }
      ;
      function nb(a) {
        return "undefined" !== typeof JSON && n(JSON.parse) ? JSON.parse(a) : Aa(a);
      }
      function B(a) {
        if ("undefined" !== typeof JSON && n(JSON.stringify))
          a = JSON.stringify(a);
        else {
          var b = [];
          Ca(new Ba, a, b);
          a = b.join("");
        }
        return a;
      }
      ;
      function ob() {
        this.Wd = C;
      }
      ob.prototype.j = function(a) {
        return this.Wd.Q(a);
      };
      ob.prototype.toString = function() {
        return this.Wd.toString();
      };
      function pb() {}
      pb.prototype.qf = function() {
        return null;
      };
      pb.prototype.ye = function() {
        return null;
      };
      var qb = new pb;
      function rb(a, b, c) {
        this.Tf = a;
        this.Ka = b;
        this.Kd = c;
      }
      rb.prototype.qf = function(a) {
        var b = this.Ka.O;
        if (sb(b, a))
          return b.j().R(a);
        b = null != this.Kd ? new tb(this.Kd, !0, !1) : this.Ka.w();
        return this.Tf.xc(a, b);
      };
      rb.prototype.ye = function(a, b, c) {
        var d = null != this.Kd ? this.Kd : ub(this.Ka);
        a = this.Tf.ne(d, b, 1, c, a);
        return 0 === a.length ? null : a[0];
      };
      function vb() {
        this.tb = [];
      }
      function wb(a, b) {
        for (var c = null,
            d = 0; d < b.length; d++) {
          var e = b[d],
              f = e.Zb();
          null === c || f.ca(c.Zb()) || (a.tb.push(c), c = null);
          null === c && (c = new xb(f));
          c.add(e);
        }
        c && a.tb.push(c);
      }
      function yb(a, b, c) {
        wb(a, c);
        zb(a, function(a) {
          return a.ca(b);
        });
      }
      function Ab(a, b, c) {
        wb(a, c);
        zb(a, function(a) {
          return a.contains(b) || b.contains(a);
        });
      }
      function zb(a, b) {
        for (var c = !0,
            d = 0; d < a.tb.length; d++) {
          var e = a.tb[d];
          if (e)
            if (e = e.Zb(), b(e)) {
              for (var e = a.tb[d],
                  f = 0; f < e.vd.length; f++) {
                var h = e.vd[f];
                if (null !== h) {
                  e.vd[f] = null;
                  var k = h.Vb();
                  Bb && Cb("event: " + h.toString());
                  Db(k);
                }
              }
              a.tb[d] = null;
            } else
              c = !1;
        }
        c && (a.tb = []);
      }
      function xb(a) {
        this.ra = a;
        this.vd = [];
      }
      xb.prototype.add = function(a) {
        this.vd.push(a);
      };
      xb.prototype.Zb = function() {
        return this.ra;
      };
      function D(a, b, c, d) {
        this.type = a;
        this.Ja = b;
        this.Wa = c;
        this.Ke = d;
        this.Qd = void 0;
      }
      function Eb(a) {
        return new D(Fb, a);
      }
      var Fb = "value";
      function Gb(a, b, c, d) {
        this.ue = b;
        this.Zd = c;
        this.Qd = d;
        this.ud = a;
      }
      Gb.prototype.Zb = function() {
        var a = this.Zd.Ib();
        return "value" === this.ud ? a.path : a.parent().path;
      };
      Gb.prototype.ze = function() {
        return this.ud;
      };
      Gb.prototype.Vb = function() {
        return this.ue.Vb(this);
      };
      Gb.prototype.toString = function() {
        return this.Zb().toString() + ":" + this.ud + ":" + B(this.Zd.mf());
      };
      function Hb(a, b, c) {
        this.ue = a;
        this.error = b;
        this.path = c;
      }
      Hb.prototype.Zb = function() {
        return this.path;
      };
      Hb.prototype.ze = function() {
        return "cancel";
      };
      Hb.prototype.Vb = function() {
        return this.ue.Vb(this);
      };
      Hb.prototype.toString = function() {
        return this.path.toString() + ":cancel";
      };
      function tb(a, b, c) {
        this.A = a;
        this.ea = b;
        this.Ub = c;
      }
      function Ib(a) {
        return a.ea;
      }
      function Jb(a) {
        return a.Ub;
      }
      function Kb(a, b) {
        return b.e() ? a.ea && !a.Ub : sb(a, E(b));
      }
      function sb(a, b) {
        return a.ea && !a.Ub || a.A.Da(b);
      }
      tb.prototype.j = function() {
        return this.A;
      };
      function Lb(a) {
        this.gg = a;
        this.Dd = null;
      }
      Lb.prototype.get = function() {
        var a = this.gg.get(),
            b = xa(a);
        if (this.Dd)
          for (var c in this.Dd)
            b[c] -= this.Dd[c];
        this.Dd = a;
        return b;
      };
      function Mb(a, b) {
        this.Of = {};
        this.fd = new Lb(a);
        this.ba = b;
        var c = 1E4 + 2E4 * Math.random();
        setTimeout(q(this.If, this), Math.floor(c));
      }
      Mb.prototype.If = function() {
        var a = this.fd.get(),
            b = {},
            c = !1,
            d;
        for (d in a)
          0 < a[d] && v(this.Of, d) && (b[d] = a[d], c = !0);
        c && this.ba.Ue(b);
        setTimeout(q(this.If, this), Math.floor(6E5 * Math.random()));
      };
      function Nb() {
        this.Ec = {};
      }
      function Ob(a, b, c) {
        n(c) || (c = 1);
        v(a.Ec, b) || (a.Ec[b] = 0);
        a.Ec[b] += c;
      }
      Nb.prototype.get = function() {
        return xa(this.Ec);
      };
      var Pb = {},
          Qb = {};
      function Rb(a) {
        a = a.toString();
        Pb[a] || (Pb[a] = new Nb);
        return Pb[a];
      }
      function Sb(a, b) {
        var c = a.toString();
        Qb[c] || (Qb[c] = b());
        return Qb[c];
      }
      ;
      function F(a, b) {
        this.name = a;
        this.S = b;
      }
      function Tb(a, b) {
        return new F(a, b);
      }
      ;
      function Ub(a, b) {
        return Vb(a.name, b.name);
      }
      function Wb(a, b) {
        return Vb(a, b);
      }
      ;
      function Xb(a, b, c) {
        this.type = Yb;
        this.source = a;
        this.path = b;
        this.Ga = c;
      }
      Xb.prototype.Xc = function(a) {
        return this.path.e() ? new Xb(this.source, G, this.Ga.R(a)) : new Xb(this.source, H(this.path), this.Ga);
      };
      Xb.prototype.toString = function() {
        return "Operation(" + this.path + ": " + this.source.toString() + " overwrite: " + this.Ga.toString() + ")";
      };
      function Zb(a, b) {
        this.type = $b;
        this.source = a;
        this.path = b;
      }
      Zb.prototype.Xc = function() {
        return this.path.e() ? new Zb(this.source, G) : new Zb(this.source, H(this.path));
      };
      Zb.prototype.toString = function() {
        return "Operation(" + this.path + ": " + this.source.toString() + " listen_complete)";
      };
      function ac(a, b) {
        this.La = a;
        this.wa = b ? b : bc;
      }
      g = ac.prototype;
      g.Oa = function(a, b) {
        return new ac(this.La, this.wa.Oa(a, b, this.La).Y(null, null, !1, null, null));
      };
      g.remove = function(a) {
        return new ac(this.La, this.wa.remove(a, this.La).Y(null, null, !1, null, null));
      };
      g.get = function(a) {
        for (var b,
            c = this.wa; !c.e(); ) {
          b = this.La(a, c.key);
          if (0 === b)
            return c.value;
          0 > b ? c = c.left : 0 < b && (c = c.right);
        }
        return null;
      };
      function cc(a, b) {
        for (var c,
            d = a.wa,
            e = null; !d.e(); ) {
          c = a.La(b, d.key);
          if (0 === c) {
            if (d.left.e())
              return e ? e.key : null;
            for (d = d.left; !d.right.e(); )
              d = d.right;
            return d.key;
          }
          0 > c ? d = d.left : 0 < c && (e = d, d = d.right);
        }
        throw Error("Attempted to find predecessor key for a nonexistent key.  What gives?");
      }
      g.e = function() {
        return this.wa.e();
      };
      g.count = function() {
        return this.wa.count();
      };
      g.Sc = function() {
        return this.wa.Sc();
      };
      g.fc = function() {
        return this.wa.fc();
      };
      g.ia = function(a) {
        return this.wa.ia(a);
      };
      g.Xb = function(a) {
        return new dc(this.wa, null, this.La, !1, a);
      };
      g.Yb = function(a, b) {
        return new dc(this.wa, a, this.La, !1, b);
      };
      g.$b = function(a, b) {
        return new dc(this.wa, a, this.La, !0, b);
      };
      g.sf = function(a) {
        return new dc(this.wa, null, this.La, !0, a);
      };
      function dc(a, b, c, d, e) {
        this.Ud = e || null;
        this.Fe = d;
        this.Pa = [];
        for (e = 1; !a.e(); )
          if (e = b ? c(a.key, b) : 1, d && (e *= -1), 0 > e)
            a = this.Fe ? a.left : a.right;
          else if (0 === e) {
            this.Pa.push(a);
            break;
          } else
            this.Pa.push(a), a = this.Fe ? a.right : a.left;
      }
      function J(a) {
        if (0 === a.Pa.length)
          return null;
        var b = a.Pa.pop(),
            c;
        c = a.Ud ? a.Ud(b.key, b.value) : {
          key: b.key,
          value: b.value
        };
        if (a.Fe)
          for (b = b.left; !b.e(); )
            a.Pa.push(b), b = b.right;
        else
          for (b = b.right; !b.e(); )
            a.Pa.push(b), b = b.left;
        return c;
      }
      function ec(a) {
        if (0 === a.Pa.length)
          return null;
        var b;
        b = a.Pa;
        b = b[b.length - 1];
        return a.Ud ? a.Ud(b.key, b.value) : {
          key: b.key,
          value: b.value
        };
      }
      function fc(a, b, c, d, e) {
        this.key = a;
        this.value = b;
        this.color = null != c ? c : !0;
        this.left = null != d ? d : bc;
        this.right = null != e ? e : bc;
      }
      g = fc.prototype;
      g.Y = function(a, b, c, d, e) {
        return new fc(null != a ? a : this.key, null != b ? b : this.value, null != c ? c : this.color, null != d ? d : this.left, null != e ? e : this.right);
      };
      g.count = function() {
        return this.left.count() + 1 + this.right.count();
      };
      g.e = function() {
        return !1;
      };
      g.ia = function(a) {
        return this.left.ia(a) || a(this.key, this.value) || this.right.ia(a);
      };
      function gc(a) {
        return a.left.e() ? a : gc(a.left);
      }
      g.Sc = function() {
        return gc(this).key;
      };
      g.fc = function() {
        return this.right.e() ? this.key : this.right.fc();
      };
      g.Oa = function(a, b, c) {
        var d,
            e;
        e = this;
        d = c(a, e.key);
        e = 0 > d ? e.Y(null, null, null, e.left.Oa(a, b, c), null) : 0 === d ? e.Y(null, b, null, null, null) : e.Y(null, null, null, null, e.right.Oa(a, b, c));
        return hc(e);
      };
      function ic(a) {
        if (a.left.e())
          return bc;
        a.left.fa() || a.left.left.fa() || (a = jc(a));
        a = a.Y(null, null, null, ic(a.left), null);
        return hc(a);
      }
      g.remove = function(a, b) {
        var c,
            d;
        c = this;
        if (0 > b(a, c.key))
          c.left.e() || c.left.fa() || c.left.left.fa() || (c = jc(c)), c = c.Y(null, null, null, c.left.remove(a, b), null);
        else {
          c.left.fa() && (c = kc(c));
          c.right.e() || c.right.fa() || c.right.left.fa() || (c = lc(c), c.left.left.fa() && (c = kc(c), c = lc(c)));
          if (0 === b(a, c.key)) {
            if (c.right.e())
              return bc;
            d = gc(c.right);
            c = c.Y(d.key, d.value, null, null, ic(c.right));
          }
          c = c.Y(null, null, null, null, c.right.remove(a, b));
        }
        return hc(c);
      };
      g.fa = function() {
        return this.color;
      };
      function hc(a) {
        a.right.fa() && !a.left.fa() && (a = mc(a));
        a.left.fa() && a.left.left.fa() && (a = kc(a));
        a.left.fa() && a.right.fa() && (a = lc(a));
        return a;
      }
      function jc(a) {
        a = lc(a);
        a.right.left.fa() && (a = a.Y(null, null, null, null, kc(a.right)), a = mc(a), a = lc(a));
        return a;
      }
      function mc(a) {
        return a.right.Y(null, null, a.color, a.Y(null, null, !0, null, a.right.left), null);
      }
      function kc(a) {
        return a.left.Y(null, null, a.color, null, a.Y(null, null, !0, a.left.right, null));
      }
      function lc(a) {
        return a.Y(null, null, !a.color, a.left.Y(null, null, !a.left.color, null, null), a.right.Y(null, null, !a.right.color, null, null));
      }
      function nc() {}
      g = nc.prototype;
      g.Y = function() {
        return this;
      };
      g.Oa = function(a, b) {
        return new fc(a, b, null);
      };
      g.remove = function() {
        return this;
      };
      g.count = function() {
        return 0;
      };
      g.e = function() {
        return !0;
      };
      g.ia = function() {
        return !1;
      };
      g.Sc = function() {
        return null;
      };
      g.fc = function() {
        return null;
      };
      g.fa = function() {
        return !1;
      };
      var bc = new nc;
      function oc(a, b) {
        return a && "object" === typeof a ? (K(".sv" in a, "Unexpected leaf node or priority contents"), b[a[".sv"]]) : a;
      }
      function pc(a, b) {
        var c = new qc;
        rc(a, new L(""), function(a, e) {
          c.nc(a, sc(e, b));
        });
        return c;
      }
      function sc(a, b) {
        var c = a.C().I(),
            c = oc(c, b),
            d;
        if (a.K()) {
          var e = oc(a.Ca(), b);
          return e !== a.Ca() || c !== a.C().I() ? new tc(e, M(c)) : a;
        }
        d = a;
        c !== a.C().I() && (d = d.ga(new tc(c)));
        a.P(N, function(a, c) {
          var e = sc(c, b);
          e !== c && (d = d.U(a, e));
        });
        return d;
      }
      ;
      function uc() {
        this.wc = {};
      }
      uc.prototype.set = function(a, b) {
        null == b ? delete this.wc[a] : this.wc[a] = b;
      };
      uc.prototype.get = function(a) {
        return v(this.wc, a) ? this.wc[a] : null;
      };
      uc.prototype.remove = function(a) {
        delete this.wc[a];
      };
      uc.prototype.wf = !0;
      function vc(a) {
        this.Fc = a;
        this.Pd = "firebase:";
      }
      g = vc.prototype;
      g.set = function(a, b) {
        null == b ? this.Fc.removeItem(this.Pd + a) : this.Fc.setItem(this.Pd + a, B(b));
      };
      g.get = function(a) {
        a = this.Fc.getItem(this.Pd + a);
        return null == a ? null : nb(a);
      };
      g.remove = function(a) {
        this.Fc.removeItem(this.Pd + a);
      };
      g.wf = !1;
      g.toString = function() {
        return this.Fc.toString();
      };
      function wc(a) {
        try {
          if ("undefined" !== typeof window && "undefined" !== typeof window[a]) {
            var b = window[a];
            b.setItem("firebase:sentinel", "cache");
            b.removeItem("firebase:sentinel");
            return new vc(b);
          }
        } catch (c) {}
        return new uc;
      }
      var xc = wc("localStorage"),
          yc = wc("sessionStorage");
      function zc(a, b, c, d, e) {
        this.host = a.toLowerCase();
        this.domain = this.host.substr(this.host.indexOf(".") + 1);
        this.kb = b;
        this.hc = c;
        this.Wg = d;
        this.Od = e || "";
        this.Ya = xc.get("host:" + a) || this.host;
      }
      function Ac(a, b) {
        b !== a.Ya && (a.Ya = b, "s-" === a.Ya.substr(0, 2) && xc.set("host:" + a.host, a.Ya));
      }
      function Bc(a, b, c) {
        K("string" === typeof b, "typeof type must == string");
        K("object" === typeof c, "typeof params must == object");
        if (b === Cc)
          b = (a.kb ? "wss://" : "ws://") + a.Ya + "/.ws?";
        else if (b === Dc)
          b = (a.kb ? "https://" : "http://") + a.Ya + "/.lp?";
        else
          throw Error("Unknown connection type: " + b);
        a.host !== a.Ya && (c.ns = a.hc);
        var d = [];
        r(c, function(a, b) {
          d.push(b + "=" + a);
        });
        return b + d.join("&");
      }
      zc.prototype.toString = function() {
        var a = (this.kb ? "https://" : "http://") + this.host;
        this.Od && (a += "<" + this.Od + ">");
        return a;
      };
      var Ec = function() {
        var a = 1;
        return function() {
          return a++;
        };
      }();
      function K(a, b) {
        if (!a)
          throw Fc(b);
      }
      function Fc(a) {
        return Error("Firebase (" + hb + ") INTERNAL ASSERT FAILED: " + a);
      }
      function Gc(a) {
        try {
          var b;
          if ("undefined" !== typeof atob)
            b = atob(a);
          else {
            gb();
            for (var c = eb,
                d = [],
                e = 0; e < a.length; ) {
              var f = c[a.charAt(e++)],
                  h = e < a.length ? c[a.charAt(e)] : 0;
              ++e;
              var k = e < a.length ? c[a.charAt(e)] : 64;
              ++e;
              var l = e < a.length ? c[a.charAt(e)] : 64;
              ++e;
              if (null == f || null == h || null == k || null == l)
                throw Error();
              d.push(f << 2 | h >> 4);
              64 != k && (d.push(h << 4 & 240 | k >> 2), 64 != l && d.push(k << 6 & 192 | l));
            }
            if (8192 > d.length)
              b = String.fromCharCode.apply(null, d);
            else {
              a = "";
              for (c = 0; c < d.length; c += 8192)
                a += String.fromCharCode.apply(null, Wa(d, c, c + 8192));
              b = a;
            }
          }
          return b;
        } catch (m) {
          Cb("base64Decode failed: ", m);
        }
        return null;
      }
      function Hc(a) {
        var b = Ic(a);
        a = new La;
        a.update(b);
        var b = [],
            c = 8 * a.de;
        56 > a.ac ? a.update(a.Ld, 56 - a.ac) : a.update(a.Ld, a.Va - (a.ac - 56));
        for (var d = a.Va - 1; 56 <= d; d--)
          a.me[d] = c & 255, c /= 256;
        Ma(a, a.me);
        for (d = c = 0; 5 > d; d++)
          for (var e = 24; 0 <= e; e -= 8)
            b[c] = a.N[d] >> e & 255, ++c;
        return fb(b);
      }
      function Jc(a) {
        for (var b = "",
            c = 0; c < arguments.length; c++)
          b = fa(arguments[c]) ? b + Jc.apply(null, arguments[c]) : "object" === typeof arguments[c] ? b + B(arguments[c]) : b + arguments[c], b += " ";
        return b;
      }
      var Bb = null,
          Kc = !0;
      function Cb(a) {
        !0 === Kc && (Kc = !1, null === Bb && !0 === yc.get("logging_enabled") && Lc(!0));
        if (Bb) {
          var b = Jc.apply(null, arguments);
          Bb(b);
        }
      }
      function Mc(a) {
        return function() {
          Cb(a, arguments);
        };
      }
      function Nc(a) {
        if ("undefined" !== typeof console) {
          var b = "FIREBASE INTERNAL ERROR: " + Jc.apply(null, arguments);
          "undefined" !== typeof console.error ? console.error(b) : console.log(b);
        }
      }
      function Oc(a) {
        var b = Jc.apply(null, arguments);
        throw Error("FIREBASE FATAL ERROR: " + b);
      }
      function O(a) {
        if ("undefined" !== typeof console) {
          var b = "FIREBASE WARNING: " + Jc.apply(null, arguments);
          "undefined" !== typeof console.warn ? console.warn(b) : console.log(b);
        }
      }
      function Pc(a) {
        var b = "",
            c = "",
            d = "",
            e = "",
            f = !0,
            h = "https",
            k = 443;
        if (p(a)) {
          var l = a.indexOf("//");
          0 <= l && (h = a.substring(0, l - 1), a = a.substring(l + 2));
          l = a.indexOf("/");
          -1 === l && (l = a.length);
          b = a.substring(0, l);
          e = "";
          a = a.substring(l).split("/");
          for (l = 0; l < a.length; l++)
            if (0 < a[l].length) {
              var m = a[l];
              try {
                m = decodeURIComponent(m.replace(/\+/g, " "));
              } catch (t) {}
              e += "/" + m;
            }
          a = b.split(".");
          3 === a.length ? (c = a[1], d = a[0].toLowerCase()) : 2 === a.length && (c = a[0]);
          l = b.indexOf(":");
          0 <= l && (f = "https" === h || "wss" === h, k = b.substring(l + 1), isFinite(k) && (k = String(k)), k = p(k) ? /^\s*-?0x/i.test(k) ? parseInt(k, 16) : parseInt(k, 10) : NaN);
        }
        return {
          host: b,
          port: k,
          domain: c,
          Tg: d,
          kb: f,
          scheme: h,
          $c: e
        };
      }
      function Qc(a) {
        return ga(a) && (a != a || a == Number.POSITIVE_INFINITY || a == Number.NEGATIVE_INFINITY);
      }
      function Rc(a) {
        if ("complete" === document.readyState)
          a();
        else {
          var b = !1,
              c = function() {
                document.body ? b || (b = !0, a()) : setTimeout(c, Math.floor(10));
              };
          document.addEventListener ? (document.addEventListener("DOMContentLoaded", c, !1), window.addEventListener("load", c, !1)) : document.attachEvent && (document.attachEvent("onreadystatechange", function() {
            "complete" === document.readyState && c();
          }), window.attachEvent("onload", c));
        }
      }
      function Vb(a, b) {
        if (a === b)
          return 0;
        if ("[MIN_NAME]" === a || "[MAX_NAME]" === b)
          return -1;
        if ("[MIN_NAME]" === b || "[MAX_NAME]" === a)
          return 1;
        var c = Sc(a),
            d = Sc(b);
        return null !== c ? null !== d ? 0 == c - d ? a.length - b.length : c - d : -1 : null !== d ? 1 : a < b ? -1 : 1;
      }
      function Tc(a, b) {
        if (b && a in b)
          return b[a];
        throw Error("Missing required key (" + a + ") in object: " + B(b));
      }
      function Uc(a) {
        if ("object" !== typeof a || null === a)
          return B(a);
        var b = [],
            c;
        for (c in a)
          b.push(c);
        b.sort();
        c = "{";
        for (var d = 0; d < b.length; d++)
          0 !== d && (c += ","), c += B(b[d]), c += ":", c += Uc(a[b[d]]);
        return c + "}";
      }
      function Vc(a, b) {
        if (a.length <= b)
          return [a];
        for (var c = [],
            d = 0; d < a.length; d += b)
          d + b > a ? c.push(a.substring(d, a.length)) : c.push(a.substring(d, d + b));
        return c;
      }
      function Wc(a, b) {
        if (ea(a))
          for (var c = 0; c < a.length; ++c)
            b(c, a[c]);
        else
          r(a, b);
      }
      function Xc(a) {
        K(!Qc(a), "Invalid JSON number");
        var b,
            c,
            d,
            e;
        0 === a ? (d = c = 0, b = -Infinity === 1 / a ? 1 : 0) : (b = 0 > a, a = Math.abs(a), a >= Math.pow(2, -1022) ? (d = Math.min(Math.floor(Math.log(a) / Math.LN2), 1023), c = d + 1023, d = Math.round(a * Math.pow(2, 52 - d) - Math.pow(2, 52))) : (c = 0, d = Math.round(a / Math.pow(2, -1074))));
        e = [];
        for (a = 52; a; --a)
          e.push(d % 2 ? 1 : 0), d = Math.floor(d / 2);
        for (a = 11; a; --a)
          e.push(c % 2 ? 1 : 0), c = Math.floor(c / 2);
        e.push(b ? 1 : 0);
        e.reverse();
        b = e.join("");
        c = "";
        for (a = 0; 64 > a; a += 8)
          d = parseInt(b.substr(a, 8), 2).toString(16), 1 === d.length && (d = "0" + d), c += d;
        return c.toLowerCase();
      }
      var Yc = /^-?\d{1,10}$/;
      function Sc(a) {
        return Yc.test(a) && (a = Number(a), -2147483648 <= a && 2147483647 >= a) ? a : null;
      }
      function Db(a) {
        try {
          a();
        } catch (b) {
          setTimeout(function() {
            O("Exception was thrown by user callback.", b.stack || "");
            throw b;
          }, Math.floor(0));
        }
      }
      function P(a, b) {
        if (ha(a)) {
          var c = Array.prototype.slice.call(arguments, 1).slice();
          Db(function() {
            a.apply(null, c);
          });
        }
      }
      ;
      function Ic(a) {
        for (var b = [],
            c = 0,
            d = 0; d < a.length; d++) {
          var e = a.charCodeAt(d);
          55296 <= e && 56319 >= e && (e -= 55296, d++, K(d < a.length, "Surrogate pair missing trail surrogate."), e = 65536 + (e << 10) + (a.charCodeAt(d) - 56320));
          128 > e ? b[c++] = e : (2048 > e ? b[c++] = e >> 6 | 192 : (65536 > e ? b[c++] = e >> 12 | 224 : (b[c++] = e >> 18 | 240, b[c++] = e >> 12 & 63 | 128), b[c++] = e >> 6 & 63 | 128), b[c++] = e & 63 | 128);
        }
        return b;
      }
      function Zc(a) {
        for (var b = 0,
            c = 0; c < a.length; c++) {
          var d = a.charCodeAt(c);
          128 > d ? b++ : 2048 > d ? b += 2 : 55296 <= d && 56319 >= d ? (b += 4, c++) : b += 3;
        }
        return b;
      }
      ;
      function $c(a) {
        var b = {},
            c = {},
            d = {},
            e = "";
        try {
          var f = a.split("."),
              b = nb(Gc(f[0]) || ""),
              c = nb(Gc(f[1]) || ""),
              e = f[2],
              d = c.d || {};
          delete c.d;
        } catch (h) {}
        return {
          Zg: b,
          Bc: c,
          data: d,
          Qg: e
        };
      }
      function ad(a) {
        a = $c(a).Bc;
        return "object" === typeof a && a.hasOwnProperty("iat") ? w(a, "iat") : null;
      }
      function bd(a) {
        a = $c(a);
        var b = a.Bc;
        return !!a.Qg && !!b && "object" === typeof b && b.hasOwnProperty("iat");
      }
      ;
      function cd(a) {
        this.W = a;
        this.g = a.n.g;
      }
      function dd(a, b, c, d) {
        var e = [],
            f = [];
        Oa(b, function(b) {
          "child_changed" === b.type && a.g.Ad(b.Ke, b.Ja) && f.push(new D("child_moved", b.Ja, b.Wa));
        });
        ed(a, e, "child_removed", b, d, c);
        ed(a, e, "child_added", b, d, c);
        ed(a, e, "child_moved", f, d, c);
        ed(a, e, "child_changed", b, d, c);
        ed(a, e, Fb, b, d, c);
        return e;
      }
      function ed(a, b, c, d, e, f) {
        d = Pa(d, function(a) {
          return a.type === c;
        });
        Xa(d, q(a.hg, a));
        Oa(d, function(c) {
          var d = fd(a, c, f);
          Oa(e, function(e) {
            e.Kf(c.type) && b.push(e.createEvent(d, a.W));
          });
        });
      }
      function fd(a, b, c) {
        "value" !== b.type && "child_removed" !== b.type && (b.Qd = c.rf(b.Wa, b.Ja, a.g));
        return b;
      }
      cd.prototype.hg = function(a, b) {
        if (null == a.Wa || null == b.Wa)
          throw Fc("Should only compare child_ events.");
        return this.g.compare(new F(a.Wa, a.Ja), new F(b.Wa, b.Ja));
      };
      function gd() {
        this.bb = {};
      }
      function hd(a, b) {
        var c = b.type,
            d = b.Wa;
        K("child_added" == c || "child_changed" == c || "child_removed" == c, "Only child changes supported for tracking");
        K(".priority" !== d, "Only non-priority child changes can be tracked.");
        var e = w(a.bb, d);
        if (e) {
          var f = e.type;
          if ("child_added" == c && "child_removed" == f)
            a.bb[d] = new D("child_changed", b.Ja, d, e.Ja);
          else if ("child_removed" == c && "child_added" == f)
            delete a.bb[d];
          else if ("child_removed" == c && "child_changed" == f)
            a.bb[d] = new D("child_removed", e.Ke, d);
          else if ("child_changed" == c && "child_added" == f)
            a.bb[d] = new D("child_added", b.Ja, d);
          else if ("child_changed" == c && "child_changed" == f)
            a.bb[d] = new D("child_changed", b.Ja, d, e.Ke);
          else
            throw Fc("Illegal combination of changes: " + b + " occurred after " + e);
        } else
          a.bb[d] = b;
      }
      ;
      function id(a, b, c) {
        this.Rb = a;
        this.pb = b;
        this.rb = c || null;
      }
      g = id.prototype;
      g.Kf = function(a) {
        return "value" === a;
      };
      g.createEvent = function(a, b) {
        var c = b.n.g;
        return new Gb("value", this, new Q(a.Ja, b.Ib(), c));
      };
      g.Vb = function(a) {
        var b = this.rb;
        if ("cancel" === a.ze()) {
          K(this.pb, "Raising a cancel event on a listener with no cancel callback");
          var c = this.pb;
          return function() {
            c.call(b, a.error);
          };
        }
        var d = this.Rb;
        return function() {
          d.call(b, a.Zd);
        };
      };
      g.gf = function(a, b) {
        return this.pb ? new Hb(this, a, b) : null;
      };
      g.matches = function(a) {
        return a instanceof id ? a.Rb && this.Rb ? a.Rb === this.Rb && a.rb === this.rb : !0 : !1;
      };
      g.tf = function() {
        return null !== this.Rb;
      };
      function jd(a, b, c) {
        this.ha = a;
        this.pb = b;
        this.rb = c;
      }
      g = jd.prototype;
      g.Kf = function(a) {
        a = "children_added" === a ? "child_added" : a;
        return ("children_removed" === a ? "child_removed" : a) in this.ha;
      };
      g.gf = function(a, b) {
        return this.pb ? new Hb(this, a, b) : null;
      };
      g.createEvent = function(a, b) {
        K(null != a.Wa, "Child events should have a childName.");
        var c = b.Ib().u(a.Wa);
        return new Gb(a.type, this, new Q(a.Ja, c, b.n.g), a.Qd);
      };
      g.Vb = function(a) {
        var b = this.rb;
        if ("cancel" === a.ze()) {
          K(this.pb, "Raising a cancel event on a listener with no cancel callback");
          var c = this.pb;
          return function() {
            c.call(b, a.error);
          };
        }
        var d = this.ha[a.ud];
        return function() {
          d.call(b, a.Zd, a.Qd);
        };
      };
      g.matches = function(a) {
        if (a instanceof jd) {
          if (!this.ha || !a.ha)
            return !0;
          if (this.rb === a.rb) {
            var b = pa(a.ha);
            if (b === pa(this.ha)) {
              if (1 === b) {
                var b = qa(a.ha),
                    c = qa(this.ha);
                return c === b && (!a.ha[b] || !this.ha[c] || a.ha[b] === this.ha[c]);
              }
              return oa(this.ha, function(b, c) {
                return a.ha[c] === b;
              });
            }
          }
        }
        return !1;
      };
      g.tf = function() {
        return null !== this.ha;
      };
      function kd(a) {
        this.g = a;
      }
      g = kd.prototype;
      g.G = function(a, b, c, d, e, f) {
        K(a.Jc(this.g), "A node must be indexed if only a child is updated");
        e = a.R(b);
        if (e.Q(d).ca(c.Q(d)) && e.e() == c.e())
          return a;
        null != f && (c.e() ? a.Da(b) ? hd(f, new D("child_removed", e, b)) : K(a.K(), "A child remove without an old child only makes sense on a leaf node") : e.e() ? hd(f, new D("child_added", c, b)) : hd(f, new D("child_changed", c, b, e)));
        return a.K() && c.e() ? a : a.U(b, c).lb(this.g);
      };
      g.xa = function(a, b, c) {
        null != c && (a.K() || a.P(N, function(a, e) {
          b.Da(a) || hd(c, new D("child_removed", e, a));
        }), b.K() || b.P(N, function(b, e) {
          if (a.Da(b)) {
            var f = a.R(b);
            f.ca(e) || hd(c, new D("child_changed", e, b, f));
          } else
            hd(c, new D("child_added", e, b));
        }));
        return b.lb(this.g);
      };
      g.ga = function(a, b) {
        return a.e() ? C : a.ga(b);
      };
      g.Na = function() {
        return !1;
      };
      g.Wb = function() {
        return this;
      };
      function ld(a) {
        this.Be = new kd(a.g);
        this.g = a.g;
        var b;
        a.ma ? (b = md(a), b = a.g.Pc(nd(a), b)) : b = a.g.Tc();
        this.ed = b;
        a.pa ? (b = od(a), a = a.g.Pc(pd(a), b)) : a = a.g.Qc();
        this.Gc = a;
      }
      g = ld.prototype;
      g.matches = function(a) {
        return 0 >= this.g.compare(this.ed, a) && 0 >= this.g.compare(a, this.Gc);
      };
      g.G = function(a, b, c, d, e, f) {
        this.matches(new F(b, c)) || (c = C);
        return this.Be.G(a, b, c, d, e, f);
      };
      g.xa = function(a, b, c) {
        b.K() && (b = C);
        var d = b.lb(this.g),
            d = d.ga(C),
            e = this;
        b.P(N, function(a, b) {
          e.matches(new F(a, b)) || (d = d.U(a, C));
        });
        return this.Be.xa(a, d, c);
      };
      g.ga = function(a) {
        return a;
      };
      g.Na = function() {
        return !0;
      };
      g.Wb = function() {
        return this.Be;
      };
      function qd(a) {
        this.sa = new ld(a);
        this.g = a.g;
        K(a.ja, "Only valid if limit has been set");
        this.ka = a.ka;
        this.Jb = !rd(a);
      }
      g = qd.prototype;
      g.G = function(a, b, c, d, e, f) {
        this.sa.matches(new F(b, c)) || (c = C);
        return a.R(b).ca(c) ? a : a.Db() < this.ka ? this.sa.Wb().G(a, b, c, d, e, f) : sd(this, a, b, c, e, f);
      };
      g.xa = function(a, b, c) {
        var d;
        if (b.K() || b.e())
          d = C.lb(this.g);
        else if (2 * this.ka < b.Db() && b.Jc(this.g)) {
          d = C.lb(this.g);
          b = this.Jb ? b.$b(this.sa.Gc, this.g) : b.Yb(this.sa.ed, this.g);
          for (var e = 0; 0 < b.Pa.length && e < this.ka; ) {
            var f = J(b),
                h;
            if (h = this.Jb ? 0 >= this.g.compare(this.sa.ed, f) : 0 >= this.g.compare(f, this.sa.Gc))
              d = d.U(f.name, f.S), e++;
            else
              break;
          }
        } else {
          d = b.lb(this.g);
          d = d.ga(C);
          var k,
              l,
              m;
          if (this.Jb) {
            b = d.sf(this.g);
            k = this.sa.Gc;
            l = this.sa.ed;
            var t = td(this.g);
            m = function(a, b) {
              return t(b, a);
            };
          } else
            b = d.Xb(this.g), k = this.sa.ed, l = this.sa.Gc, m = td(this.g);
          for (var e = 0,
              z = !1; 0 < b.Pa.length; )
            f = J(b), !z && 0 >= m(k, f) && (z = !0), (h = z && e < this.ka && 0 >= m(f, l)) ? e++ : d = d.U(f.name, C);
        }
        return this.sa.Wb().xa(a, d, c);
      };
      g.ga = function(a) {
        return a;
      };
      g.Na = function() {
        return !0;
      };
      g.Wb = function() {
        return this.sa.Wb();
      };
      function sd(a, b, c, d, e, f) {
        var h;
        if (a.Jb) {
          var k = td(a.g);
          h = function(a, b) {
            return k(b, a);
          };
        } else
          h = td(a.g);
        K(b.Db() == a.ka, "");
        var l = new F(c, d),
            m = a.Jb ? ud(b, a.g) : vd(b, a.g),
            t = a.sa.matches(l);
        if (b.Da(c)) {
          for (var z = b.R(c),
              m = e.ye(a.g, m, a.Jb); null != m && (m.name == c || b.Da(m.name)); )
            m = e.ye(a.g, m, a.Jb);
          e = null == m ? 1 : h(m, l);
          if (t && !d.e() && 0 <= e)
            return null != f && hd(f, new D("child_changed", d, c, z)), b.U(c, d);
          null != f && hd(f, new D("child_removed", z, c));
          b = b.U(c, C);
          return null != m && a.sa.matches(m) ? (null != f && hd(f, new D("child_added", m.S, m.name)), b.U(m.name, m.S)) : b;
        }
        return d.e() ? b : t && 0 <= h(m, l) ? (null != f && (hd(f, new D("child_removed", m.S, m.name)), hd(f, new D("child_added", d, c))), b.U(c, d).U(m.name, C)) : b;
      }
      ;
      function wd(a, b) {
        this.je = a;
        this.fg = b;
      }
      function xd(a) {
        this.V = a;
      }
      xd.prototype.ab = function(a, b, c, d) {
        var e = new gd,
            f;
        if (b.type === Yb)
          b.source.we ? c = yd(this, a, b.path, b.Ga, c, d, e) : (K(b.source.pf, "Unknown source."), f = b.source.af || Jb(a.w()) && !b.path.e(), c = Ad(this, a, b.path, b.Ga, c, d, f, e));
        else if (b.type === Bd)
          b.source.we ? c = Cd(this, a, b.path, b.children, c, d, e) : (K(b.source.pf, "Unknown source."), f = b.source.af || Jb(a.w()), c = Dd(this, a, b.path, b.children, c, d, f, e));
        else if (b.type === Ed)
          if (b.Vd)
            if (b = b.path, null != c.tc(b))
              c = a;
            else {
              f = new rb(c, a, d);
              d = a.O.j();
              if (b.e() || ".priority" === E(b))
                Ib(a.w()) ? b = c.za(ub(a)) : (b = a.w().j(), K(b instanceof R, "serverChildren would be complete if leaf node"), b = c.yc(b)), b = this.V.xa(d, b, e);
              else {
                var h = E(b),
                    k = c.xc(h, a.w());
                null == k && sb(a.w(), h) && (k = d.R(h));
                b = null != k ? this.V.G(d, h, k, H(b), f, e) : a.O.j().Da(h) ? this.V.G(d, h, C, H(b), f, e) : d;
                b.e() && Ib(a.w()) && (d = c.za(ub(a)), d.K() && (b = this.V.xa(b, d, e)));
              }
              d = Ib(a.w()) || null != c.tc(G);
              c = Fd(a, b, d, this.V.Na());
            }
          else
            c = Gd(this, a, b.path, b.Qb, c, d, e);
        else if (b.type === $b)
          d = b.path, b = a.w(), f = b.j(), h = b.ea || d.e(), c = Hd(this, new Id(a.O, new tb(f, h, b.Ub)), d, c, qb, e);
        else
          throw Fc("Unknown operation type: " + b.type);
        e = ra(e.bb);
        d = c;
        b = d.O;
        b.ea && (f = b.j().K() || b.j().e(), h = Jd(a), (0 < e.length || !a.O.ea || f && !b.j().ca(h) || !b.j().C().ca(h.C())) && e.push(Eb(Jd(d))));
        return new wd(c, e);
      };
      function Hd(a, b, c, d, e, f) {
        var h = b.O;
        if (null != d.tc(c))
          return b;
        var k;
        if (c.e())
          K(Ib(b.w()), "If change path is empty, we must have complete server data"), Jb(b.w()) ? (e = ub(b), d = d.yc(e instanceof R ? e : C)) : d = d.za(ub(b)), f = a.V.xa(b.O.j(), d, f);
        else {
          var l = E(c);
          if (".priority" == l)
            K(1 == Kd(c), "Can't have a priority with additional path components"), f = h.j(), k = b.w().j(), d = d.ld(c, f, k), f = null != d ? a.V.ga(f, d) : h.j();
          else {
            var m = H(c);
            sb(h, l) ? (k = b.w().j(), d = d.ld(c, h.j(), k), d = null != d ? h.j().R(l).G(m, d) : h.j().R(l)) : d = d.xc(l, b.w());
            f = null != d ? a.V.G(h.j(), l, d, m, e, f) : h.j();
          }
        }
        return Fd(b, f, h.ea || c.e(), a.V.Na());
      }
      function Ad(a, b, c, d, e, f, h, k) {
        var l = b.w();
        h = h ? a.V : a.V.Wb();
        if (c.e())
          d = h.xa(l.j(), d, null);
        else if (h.Na() && !l.Ub)
          d = l.j().G(c, d), d = h.xa(l.j(), d, null);
        else {
          var m = E(c);
          if (!Kb(l, c) && 1 < Kd(c))
            return b;
          var t = H(c);
          d = l.j().R(m).G(t, d);
          d = ".priority" == m ? h.ga(l.j(), d) : h.G(l.j(), m, d, t, qb, null);
        }
        l = l.ea || c.e();
        b = new Id(b.O, new tb(d, l, h.Na()));
        return Hd(a, b, c, e, new rb(e, b, f), k);
      }
      function yd(a, b, c, d, e, f, h) {
        var k = b.O;
        e = new rb(e, b, f);
        if (c.e())
          h = a.V.xa(b.O.j(), d, h), a = Fd(b, h, !0, a.V.Na());
        else if (f = E(c), ".priority" === f)
          h = a.V.ga(b.O.j(), d), a = Fd(b, h, k.ea, k.Ub);
        else {
          c = H(c);
          var l = k.j().R(f);
          if (!c.e()) {
            var m = e.qf(f);
            d = null != m ? ".priority" === Ld(c) && m.Q(c.parent()).e() ? m : m.G(c, d) : C;
          }
          l.ca(d) ? a = b : (h = a.V.G(k.j(), f, d, c, e, h), a = Fd(b, h, k.ea, a.V.Na()));
        }
        return a;
      }
      function Cd(a, b, c, d, e, f, h) {
        var k = b;
        Md(d, function(d, m) {
          var t = c.u(d);
          sb(b.O, E(t)) && (k = yd(a, k, t, m, e, f, h));
        });
        Md(d, function(d, m) {
          var t = c.u(d);
          sb(b.O, E(t)) || (k = yd(a, k, t, m, e, f, h));
        });
        return k;
      }
      function Nd(a, b) {
        Md(b, function(b, d) {
          a = a.G(b, d);
        });
        return a;
      }
      function Dd(a, b, c, d, e, f, h, k) {
        if (b.w().j().e() && !Ib(b.w()))
          return b;
        var l = b;
        c = c.e() ? d : Od(Pd, c, d);
        var m = b.w().j();
        c.children.ia(function(c, d) {
          if (m.Da(c)) {
            var I = b.w().j().R(c),
                I = Nd(I, d);
            l = Ad(a, l, new L(c), I, e, f, h, k);
          }
        });
        c.children.ia(function(c, d) {
          var I = !sb(b.w(), c) && null == d.value;
          m.Da(c) || I || (I = b.w().j().R(c), I = Nd(I, d), l = Ad(a, l, new L(c), I, e, f, h, k));
        });
        return l;
      }
      function Gd(a, b, c, d, e, f, h) {
        if (null != e.tc(c))
          return b;
        var k = Jb(b.w()),
            l = b.w();
        if (null != d.value) {
          if (c.e() && l.ea || Kb(l, c))
            return Ad(a, b, c, l.j().Q(c), e, f, k, h);
          if (c.e()) {
            var m = Pd;
            l.j().P(Qd, function(a, b) {
              m = m.set(new L(a), b);
            });
            return Dd(a, b, c, m, e, f, k, h);
          }
          return b;
        }
        m = Pd;
        Md(d, function(a) {
          var b = c.u(a);
          Kb(l, b) && (m = m.set(a, l.j().Q(b)));
        });
        return Dd(a, b, c, m, e, f, k, h);
      }
      ;
      function Rd() {}
      var Sd = {};
      function td(a) {
        return q(a.compare, a);
      }
      Rd.prototype.Ad = function(a, b) {
        return 0 !== this.compare(new F("[MIN_NAME]", a), new F("[MIN_NAME]", b));
      };
      Rd.prototype.Tc = function() {
        return Td;
      };
      function Ud(a) {
        K(!a.e() && ".priority" !== E(a), "Can't create PathIndex with empty path or .priority key");
        this.cc = a;
      }
      ma(Ud, Rd);
      g = Ud.prototype;
      g.Ic = function(a) {
        return !a.Q(this.cc).e();
      };
      g.compare = function(a, b) {
        var c = a.S.Q(this.cc),
            d = b.S.Q(this.cc),
            c = c.Dc(d);
        return 0 === c ? Vb(a.name, b.name) : c;
      };
      g.Pc = function(a, b) {
        var c = M(a),
            c = C.G(this.cc, c);
        return new F(b, c);
      };
      g.Qc = function() {
        var a = C.G(this.cc, Vd);
        return new F("[MAX_NAME]", a);
      };
      g.toString = function() {
        return this.cc.slice().join("/");
      };
      function Wd() {}
      ma(Wd, Rd);
      g = Wd.prototype;
      g.compare = function(a, b) {
        var c = a.S.C(),
            d = b.S.C(),
            c = c.Dc(d);
        return 0 === c ? Vb(a.name, b.name) : c;
      };
      g.Ic = function(a) {
        return !a.C().e();
      };
      g.Ad = function(a, b) {
        return !a.C().ca(b.C());
      };
      g.Tc = function() {
        return Td;
      };
      g.Qc = function() {
        return new F("[MAX_NAME]", new tc("[PRIORITY-POST]", Vd));
      };
      g.Pc = function(a, b) {
        var c = M(a);
        return new F(b, new tc("[PRIORITY-POST]", c));
      };
      g.toString = function() {
        return ".priority";
      };
      var N = new Wd;
      function Xd() {}
      ma(Xd, Rd);
      g = Xd.prototype;
      g.compare = function(a, b) {
        return Vb(a.name, b.name);
      };
      g.Ic = function() {
        throw Fc("KeyIndex.isDefinedOn not expected to be called.");
      };
      g.Ad = function() {
        return !1;
      };
      g.Tc = function() {
        return Td;
      };
      g.Qc = function() {
        return new F("[MAX_NAME]", C);
      };
      g.Pc = function(a) {
        K(p(a), "KeyIndex indexValue must always be a string.");
        return new F(a, C);
      };
      g.toString = function() {
        return ".key";
      };
      var Qd = new Xd;
      function Yd() {}
      ma(Yd, Rd);
      g = Yd.prototype;
      g.compare = function(a, b) {
        var c = a.S.Dc(b.S);
        return 0 === c ? Vb(a.name, b.name) : c;
      };
      g.Ic = function() {
        return !0;
      };
      g.Ad = function(a, b) {
        return !a.ca(b);
      };
      g.Tc = function() {
        return Td;
      };
      g.Qc = function() {
        return Zd;
      };
      g.Pc = function(a, b) {
        var c = M(a);
        return new F(b, c);
      };
      g.toString = function() {
        return ".value";
      };
      var $d = new Yd;
      function ae() {
        this.Tb = this.pa = this.Lb = this.ma = this.ja = !1;
        this.ka = 0;
        this.Nb = "";
        this.ec = null;
        this.xb = "";
        this.bc = null;
        this.vb = "";
        this.g = N;
      }
      var be = new ae;
      function rd(a) {
        return "" === a.Nb ? a.ma : "l" === a.Nb;
      }
      function nd(a) {
        K(a.ma, "Only valid if start has been set");
        return a.ec;
      }
      function md(a) {
        K(a.ma, "Only valid if start has been set");
        return a.Lb ? a.xb : "[MIN_NAME]";
      }
      function pd(a) {
        K(a.pa, "Only valid if end has been set");
        return a.bc;
      }
      function od(a) {
        K(a.pa, "Only valid if end has been set");
        return a.Tb ? a.vb : "[MAX_NAME]";
      }
      function ce(a) {
        var b = new ae;
        b.ja = a.ja;
        b.ka = a.ka;
        b.ma = a.ma;
        b.ec = a.ec;
        b.Lb = a.Lb;
        b.xb = a.xb;
        b.pa = a.pa;
        b.bc = a.bc;
        b.Tb = a.Tb;
        b.vb = a.vb;
        b.g = a.g;
        return b;
      }
      g = ae.prototype;
      g.He = function(a) {
        var b = ce(this);
        b.ja = !0;
        b.ka = a;
        b.Nb = "";
        return b;
      };
      g.Ie = function(a) {
        var b = ce(this);
        b.ja = !0;
        b.ka = a;
        b.Nb = "l";
        return b;
      };
      g.Je = function(a) {
        var b = ce(this);
        b.ja = !0;
        b.ka = a;
        b.Nb = "r";
        return b;
      };
      g.$d = function(a, b) {
        var c = ce(this);
        c.ma = !0;
        n(a) || (a = null);
        c.ec = a;
        null != b ? (c.Lb = !0, c.xb = b) : (c.Lb = !1, c.xb = "");
        return c;
      };
      g.td = function(a, b) {
        var c = ce(this);
        c.pa = !0;
        n(a) || (a = null);
        c.bc = a;
        n(b) ? (c.Tb = !0, c.vb = b) : (c.ah = !1, c.vb = "");
        return c;
      };
      function de(a, b) {
        var c = ce(a);
        c.g = b;
        return c;
      }
      function ee(a) {
        var b = {};
        a.ma && (b.sp = a.ec, a.Lb && (b.sn = a.xb));
        a.pa && (b.ep = a.bc, a.Tb && (b.en = a.vb));
        if (a.ja) {
          b.l = a.ka;
          var c = a.Nb;
          "" === c && (c = rd(a) ? "l" : "r");
          b.vf = c;
        }
        a.g !== N && (b.i = a.g.toString());
        return b;
      }
      function S(a) {
        return !(a.ma || a.pa || a.ja);
      }
      function fe(a) {
        return S(a) && a.g == N;
      }
      function ge(a) {
        var b = {};
        if (fe(a))
          return b;
        var c;
        a.g === N ? c = "$priority" : a.g === $d ? c = "$value" : a.g === Qd ? c = "$key" : (K(a.g instanceof Ud, "Unrecognized index type!"), c = a.g.toString());
        b.orderBy = B(c);
        a.ma && (b.startAt = B(a.ec), a.Lb && (b.startAt += "," + B(a.xb)));
        a.pa && (b.endAt = B(a.bc), a.Tb && (b.endAt += "," + B(a.vb)));
        a.ja && (rd(a) ? b.limitToFirst = a.ka : b.limitToLast = a.ka);
        return b;
      }
      g.toString = function() {
        return B(ee(this));
      };
      function he(a, b) {
        this.Bd = a;
        this.dc = b;
      }
      he.prototype.get = function(a) {
        var b = w(this.Bd, a);
        if (!b)
          throw Error("No index defined for " + a);
        return b === Sd ? null : b;
      };
      function ie(a, b, c) {
        var d = na(a.Bd, function(d, f) {
          var h = w(a.dc, f);
          K(h, "Missing index implementation for " + f);
          if (d === Sd) {
            if (h.Ic(b.S)) {
              for (var k = [],
                  l = c.Xb(Tb),
                  m = J(l); m; )
                m.name != b.name && k.push(m), m = J(l);
              k.push(b);
              return je(k, td(h));
            }
            return Sd;
          }
          h = c.get(b.name);
          k = d;
          h && (k = k.remove(new F(b.name, h)));
          return k.Oa(b, b.S);
        });
        return new he(d, a.dc);
      }
      function ke(a, b, c) {
        var d = na(a.Bd, function(a) {
          if (a === Sd)
            return a;
          var d = c.get(b.name);
          return d ? a.remove(new F(b.name, d)) : a;
        });
        return new he(d, a.dc);
      }
      var le = new he({".priority": Sd}, {".priority": N});
      function tc(a, b) {
        this.B = a;
        K(n(this.B) && null !== this.B, "LeafNode shouldn't be created with null/undefined value.");
        this.aa = b || C;
        me(this.aa);
        this.Cb = null;
      }
      var ne = ["object", "boolean", "number", "string"];
      g = tc.prototype;
      g.K = function() {
        return !0;
      };
      g.C = function() {
        return this.aa;
      };
      g.ga = function(a) {
        return new tc(this.B, a);
      };
      g.R = function(a) {
        return ".priority" === a ? this.aa : C;
      };
      g.Q = function(a) {
        return a.e() ? this : ".priority" === E(a) ? this.aa : C;
      };
      g.Da = function() {
        return !1;
      };
      g.rf = function() {
        return null;
      };
      g.U = function(a, b) {
        return ".priority" === a ? this.ga(b) : b.e() && ".priority" !== a ? this : C.U(a, b).ga(this.aa);
      };
      g.G = function(a, b) {
        var c = E(a);
        if (null === c)
          return b;
        if (b.e() && ".priority" !== c)
          return this;
        K(".priority" !== c || 1 === Kd(a), ".priority must be the last token in a path");
        return this.U(c, C.G(H(a), b));
      };
      g.e = function() {
        return !1;
      };
      g.Db = function() {
        return 0;
      };
      g.P = function() {
        return !1;
      };
      g.I = function(a) {
        return a && !this.C().e() ? {
          ".value": this.Ca(),
          ".priority": this.C().I()
        } : this.Ca();
      };
      g.hash = function() {
        if (null === this.Cb) {
          var a = "";
          this.aa.e() || (a += "priority:" + oe(this.aa.I()) + ":");
          var b = typeof this.B,
              a = a + (b + ":"),
              a = "number" === b ? a + Xc(this.B) : a + this.B;
          this.Cb = Hc(a);
        }
        return this.Cb;
      };
      g.Ca = function() {
        return this.B;
      };
      g.Dc = function(a) {
        if (a === C)
          return 1;
        if (a instanceof R)
          return -1;
        K(a.K(), "Unknown node type");
        var b = typeof a.B,
            c = typeof this.B,
            d = Na(ne, b),
            e = Na(ne, c);
        K(0 <= d, "Unknown leaf type: " + b);
        K(0 <= e, "Unknown leaf type: " + c);
        return d === e ? "object" === c ? 0 : this.B < a.B ? -1 : this.B === a.B ? 0 : 1 : e - d;
      };
      g.lb = function() {
        return this;
      };
      g.Jc = function() {
        return !0;
      };
      g.ca = function(a) {
        return a === this ? !0 : a.K() ? this.B === a.B && this.aa.ca(a.aa) : !1;
      };
      g.toString = function() {
        return B(this.I(!0));
      };
      function R(a, b, c) {
        this.m = a;
        (this.aa = b) && me(this.aa);
        a.e() && K(!this.aa || this.aa.e(), "An empty node cannot have a priority");
        this.wb = c;
        this.Cb = null;
      }
      g = R.prototype;
      g.K = function() {
        return !1;
      };
      g.C = function() {
        return this.aa || C;
      };
      g.ga = function(a) {
        return this.m.e() ? this : new R(this.m, a, this.wb);
      };
      g.R = function(a) {
        if (".priority" === a)
          return this.C();
        a = this.m.get(a);
        return null === a ? C : a;
      };
      g.Q = function(a) {
        var b = E(a);
        return null === b ? this : this.R(b).Q(H(a));
      };
      g.Da = function(a) {
        return null !== this.m.get(a);
      };
      g.U = function(a, b) {
        K(b, "We should always be passing snapshot nodes");
        if (".priority" === a)
          return this.ga(b);
        var c = new F(a, b),
            d,
            e;
        b.e() ? (d = this.m.remove(a), c = ke(this.wb, c, this.m)) : (d = this.m.Oa(a, b), c = ie(this.wb, c, this.m));
        e = d.e() ? C : this.aa;
        return new R(d, e, c);
      };
      g.G = function(a, b) {
        var c = E(a);
        if (null === c)
          return b;
        K(".priority" !== E(a) || 1 === Kd(a), ".priority must be the last token in a path");
        var d = this.R(c).G(H(a), b);
        return this.U(c, d);
      };
      g.e = function() {
        return this.m.e();
      };
      g.Db = function() {
        return this.m.count();
      };
      var pe = /^(0|[1-9]\d*)$/;
      g = R.prototype;
      g.I = function(a) {
        if (this.e())
          return null;
        var b = {},
            c = 0,
            d = 0,
            e = !0;
        this.P(N, function(f, h) {
          b[f] = h.I(a);
          c++;
          e && pe.test(f) ? d = Math.max(d, Number(f)) : e = !1;
        });
        if (!a && e && d < 2 * c) {
          var f = [],
              h;
          for (h in b)
            f[h] = b[h];
          return f;
        }
        a && !this.C().e() && (b[".priority"] = this.C().I());
        return b;
      };
      g.hash = function() {
        if (null === this.Cb) {
          var a = "";
          this.C().e() || (a += "priority:" + oe(this.C().I()) + ":");
          this.P(N, function(b, c) {
            var d = c.hash();
            "" !== d && (a += ":" + b + ":" + d);
          });
          this.Cb = "" === a ? "" : Hc(a);
        }
        return this.Cb;
      };
      g.rf = function(a, b, c) {
        return (c = qe(this, c)) ? (a = cc(c, new F(a, b))) ? a.name : null : cc(this.m, a);
      };
      function ud(a, b) {
        var c;
        c = (c = qe(a, b)) ? (c = c.Sc()) && c.name : a.m.Sc();
        return c ? new F(c, a.m.get(c)) : null;
      }
      function vd(a, b) {
        var c;
        c = (c = qe(a, b)) ? (c = c.fc()) && c.name : a.m.fc();
        return c ? new F(c, a.m.get(c)) : null;
      }
      g.P = function(a, b) {
        var c = qe(this, a);
        return c ? c.ia(function(a) {
          return b(a.name, a.S);
        }) : this.m.ia(b);
      };
      g.Xb = function(a) {
        return this.Yb(a.Tc(), a);
      };
      g.Yb = function(a, b) {
        var c = qe(this, b);
        if (c)
          return c.Yb(a, function(a) {
            return a;
          });
        for (var c = this.m.Yb(a.name, Tb),
            d = ec(c); null != d && 0 > b.compare(d, a); )
          J(c), d = ec(c);
        return c;
      };
      g.sf = function(a) {
        return this.$b(a.Qc(), a);
      };
      g.$b = function(a, b) {
        var c = qe(this, b);
        if (c)
          return c.$b(a, function(a) {
            return a;
          });
        for (var c = this.m.$b(a.name, Tb),
            d = ec(c); null != d && 0 < b.compare(d, a); )
          J(c), d = ec(c);
        return c;
      };
      g.Dc = function(a) {
        return this.e() ? a.e() ? 0 : -1 : a.K() || a.e() ? 1 : a === Vd ? -1 : 0;
      };
      g.lb = function(a) {
        if (a === Qd || ta(this.wb.dc, a.toString()))
          return this;
        var b = this.wb,
            c = this.m;
        K(a !== Qd, "KeyIndex always exists and isn't meant to be added to the IndexMap.");
        for (var d = [],
            e = !1,
            c = c.Xb(Tb),
            f = J(c); f; )
          e = e || a.Ic(f.S), d.push(f), f = J(c);
        d = e ? je(d, td(a)) : Sd;
        e = a.toString();
        c = xa(b.dc);
        c[e] = a;
        a = xa(b.Bd);
        a[e] = d;
        return new R(this.m, this.aa, new he(a, c));
      };
      g.Jc = function(a) {
        return a === Qd || ta(this.wb.dc, a.toString());
      };
      g.ca = function(a) {
        if (a === this)
          return !0;
        if (a.K())
          return !1;
        if (this.C().ca(a.C()) && this.m.count() === a.m.count()) {
          var b = this.Xb(N);
          a = a.Xb(N);
          for (var c = J(b),
              d = J(a); c && d; ) {
            if (c.name !== d.name || !c.S.ca(d.S))
              return !1;
            c = J(b);
            d = J(a);
          }
          return null === c && null === d;
        }
        return !1;
      };
      function qe(a, b) {
        return b === Qd ? null : a.wb.get(b.toString());
      }
      g.toString = function() {
        return B(this.I(!0));
      };
      function M(a, b) {
        if (null === a)
          return C;
        var c = null;
        "object" === typeof a && ".priority" in a ? c = a[".priority"] : "undefined" !== typeof b && (c = b);
        K(null === c || "string" === typeof c || "number" === typeof c || "object" === typeof c && ".sv" in c, "Invalid priority type found: " + typeof c);
        "object" === typeof a && ".value" in a && null !== a[".value"] && (a = a[".value"]);
        if ("object" !== typeof a || ".sv" in a)
          return new tc(a, M(c));
        if (a instanceof Array) {
          var d = C,
              e = a;
          r(e, function(a, b) {
            if (v(e, b) && "." !== b.substring(0, 1)) {
              var c = M(a);
              if (c.K() || !c.e())
                d = d.U(b, c);
            }
          });
          return d.ga(M(c));
        }
        var f = [],
            h = !1,
            k = a;
        ib(k, function(a) {
          if ("string" !== typeof a || "." !== a.substring(0, 1)) {
            var b = M(k[a]);
            b.e() || (h = h || !b.C().e(), f.push(new F(a, b)));
          }
        });
        if (0 == f.length)
          return C;
        var l = je(f, Ub, function(a) {
          return a.name;
        }, Wb);
        if (h) {
          var m = je(f, td(N));
          return new R(l, M(c), new he({".priority": m}, {".priority": N}));
        }
        return new R(l, M(c), le);
      }
      var re = Math.log(2);
      function se(a) {
        this.count = parseInt(Math.log(a + 1) / re, 10);
        this.jf = this.count - 1;
        this.eg = a + 1 & parseInt(Array(this.count + 1).join("1"), 2);
      }
      function te(a) {
        var b = !(a.eg & 1 << a.jf);
        a.jf--;
        return b;
      }
      function je(a, b, c, d) {
        function e(b, d) {
          var f = d - b;
          if (0 == f)
            return null;
          if (1 == f) {
            var m = a[b],
                t = c ? c(m) : m;
            return new fc(t, m.S, !1, null, null);
          }
          var m = parseInt(f / 2, 10) + b,
              f = e(b, m),
              z = e(m + 1, d),
              m = a[m],
              t = c ? c(m) : m;
          return new fc(t, m.S, !1, f, z);
        }
        a.sort(b);
        var f = function(b) {
          function d(b, h) {
            var k = t - b,
                z = t;
            t -= b;
            var z = e(k + 1, z),
                k = a[k],
                I = c ? c(k) : k,
                z = new fc(I, k.S, h, null, z);
            f ? f.left = z : m = z;
            f = z;
          }
          for (var f = null,
              m = null,
              t = a.length,
              z = 0; z < b.count; ++z) {
            var I = te(b),
                zd = Math.pow(2, b.count - (z + 1));
            I ? d(zd, !1) : (d(zd, !1), d(zd, !0));
          }
          return m;
        }(new se(a.length));
        return null !== f ? new ac(d || b, f) : new ac(d || b);
      }
      function oe(a) {
        return "number" === typeof a ? "number:" + Xc(a) : "string:" + a;
      }
      function me(a) {
        if (a.K()) {
          var b = a.I();
          K("string" === typeof b || "number" === typeof b || "object" === typeof b && v(b, ".sv"), "Priority must be a string or number.");
        } else
          K(a === Vd || a.e(), "priority of unexpected type.");
        K(a === Vd || a.C().e(), "Priority nodes can't have a priority of their own.");
      }
      var C = new R(new ac(Wb), null, le);
      function ue() {
        R.call(this, new ac(Wb), C, le);
      }
      ma(ue, R);
      g = ue.prototype;
      g.Dc = function(a) {
        return a === this ? 0 : 1;
      };
      g.ca = function(a) {
        return a === this;
      };
      g.C = function() {
        return this;
      };
      g.R = function() {
        return C;
      };
      g.e = function() {
        return !1;
      };
      var Vd = new ue,
          Td = new F("[MIN_NAME]", C),
          Zd = new F("[MAX_NAME]", Vd);
      function Id(a, b) {
        this.O = a;
        this.Yd = b;
      }
      function Fd(a, b, c, d) {
        return new Id(new tb(b, c, d), a.Yd);
      }
      function Jd(a) {
        return a.O.ea ? a.O.j() : null;
      }
      Id.prototype.w = function() {
        return this.Yd;
      };
      function ub(a) {
        return a.Yd.ea ? a.Yd.j() : null;
      }
      ;
      function ve(a, b) {
        this.W = a;
        var c = a.n,
            d = new kd(c.g),
            c = S(c) ? new kd(c.g) : c.ja ? new qd(c) : new ld(c);
        this.Hf = new xd(c);
        var e = b.w(),
            f = b.O,
            h = d.xa(C, e.j(), null),
            k = c.xa(C, f.j(), null);
        this.Ka = new Id(new tb(k, f.ea, c.Na()), new tb(h, e.ea, d.Na()));
        this.Xa = [];
        this.lg = new cd(a);
      }
      function we(a) {
        return a.W;
      }
      g = ve.prototype;
      g.w = function() {
        return this.Ka.w().j();
      };
      g.fb = function(a) {
        var b = ub(this.Ka);
        return b && (S(this.W.n) || !a.e() && !b.R(E(a)).e()) ? b.Q(a) : null;
      };
      g.e = function() {
        return 0 === this.Xa.length;
      };
      g.Pb = function(a) {
        this.Xa.push(a);
      };
      g.jb = function(a, b) {
        var c = [];
        if (b) {
          K(null == a, "A cancel should cancel all event registrations.");
          var d = this.W.path;
          Oa(this.Xa, function(a) {
            (a = a.gf(b, d)) && c.push(a);
          });
        }
        if (a) {
          for (var e = [],
              f = 0; f < this.Xa.length; ++f) {
            var h = this.Xa[f];
            if (!h.matches(a))
              e.push(h);
            else if (a.tf()) {
              e = e.concat(this.Xa.slice(f + 1));
              break;
            }
          }
          this.Xa = e;
        } else
          this.Xa = [];
        return c;
      };
      g.ab = function(a, b, c) {
        a.type === Bd && null !== a.source.Hb && (K(ub(this.Ka), "We should always have a full cache before handling merges"), K(Jd(this.Ka), "Missing event cache, even though we have a server cache"));
        var d = this.Ka;
        a = this.Hf.ab(d, a, b, c);
        b = this.Hf;
        c = a.je;
        K(c.O.j().Jc(b.V.g), "Event snap not indexed");
        K(c.w().j().Jc(b.V.g), "Server snap not indexed");
        K(Ib(a.je.w()) || !Ib(d.w()), "Once a server snap is complete, it should never go back");
        this.Ka = a.je;
        return xe(this, a.fg, a.je.O.j(), null);
      };
      function ye(a, b) {
        var c = a.Ka.O,
            d = [];
        c.j().K() || c.j().P(N, function(a, b) {
          d.push(new D("child_added", b, a));
        });
        c.ea && d.push(Eb(c.j()));
        return xe(a, d, c.j(), b);
      }
      function xe(a, b, c, d) {
        return dd(a.lg, b, c, d ? [d] : a.Xa);
      }
      ;
      function ze(a, b, c) {
        this.type = Bd;
        this.source = a;
        this.path = b;
        this.children = c;
      }
      ze.prototype.Xc = function(a) {
        if (this.path.e())
          return a = this.children.subtree(new L(a)), a.e() ? null : a.value ? new Xb(this.source, G, a.value) : new ze(this.source, G, a);
        K(E(this.path) === a, "Can't get a merge for a child not on the path of the operation");
        return new ze(this.source, H(this.path), this.children);
      };
      ze.prototype.toString = function() {
        return "Operation(" + this.path + ": " + this.source.toString() + " merge: " + this.children.toString() + ")";
      };
      function Ae(a, b) {
        this.f = Mc("p:rest:");
        this.F = a;
        this.Gb = b;
        this.Aa = null;
        this.$ = {};
      }
      function Be(a, b) {
        if (n(b))
          return "tag$" + b;
        K(fe(a.n), "should have a tag if it's not a default query.");
        return a.path.toString();
      }
      g = Ae.prototype;
      g.yf = function(a, b, c, d) {
        var e = a.path.toString();
        this.f("Listen called for " + e + " " + a.va());
        var f = Be(a, c),
            h = {};
        this.$[f] = h;
        a = ge(a.n);
        var k = this;
        Ce(this, e + ".json", a, function(a, b) {
          var t = b;
          404 === a && (a = t = null);
          null === a && k.Gb(e, t, !1, c);
          w(k.$, f) === h && d(a ? 401 == a ? "permission_denied" : "rest_error:" + a : "ok", null);
        });
      };
      g.Rf = function(a, b) {
        var c = Be(a, b);
        delete this.$[c];
      };
      g.M = function(a, b) {
        this.Aa = a;
        var c = $c(a),
            d = c.data,
            c = c.Bc && c.Bc.exp;
        b && b("ok", {
          auth: d,
          expires: c
        });
      };
      g.ge = function(a) {
        this.Aa = null;
        a("ok", null);
      };
      g.Me = function() {};
      g.Cf = function() {};
      g.Jd = function() {};
      g.put = function() {};
      g.zf = function() {};
      g.Ue = function() {};
      function Ce(a, b, c, d) {
        c = c || {};
        c.format = "export";
        a.Aa && (c.auth = a.Aa);
        var e = (a.F.kb ? "https://" : "http://") + a.F.host + b + "?" + kb(c);
        a.f("Sending REST request for " + e);
        var f = new XMLHttpRequest;
        f.onreadystatechange = function() {
          if (d && 4 === f.readyState) {
            a.f("REST Response for " + e + " received. status:", f.status, "response:", f.responseText);
            var b = null;
            if (200 <= f.status && 300 > f.status) {
              try {
                b = nb(f.responseText);
              } catch (c) {
                O("Failed to parse JSON response for " + e + ": " + f.responseText);
              }
              d(null, b);
            } else
              401 !== f.status && 404 !== f.status && O("Got unsuccessful REST response for " + e + " Status: " + f.status), d(f.status);
            d = null;
          }
        };
        f.open("GET", e, !0);
        f.send();
      }
      ;
      function De(a) {
        K(ea(a) && 0 < a.length, "Requires a non-empty array");
        this.Xf = a;
        this.Oc = {};
      }
      De.prototype.fe = function(a, b) {
        var c;
        c = this.Oc[a] || [];
        var d = c.length;
        if (0 < d) {
          for (var e = Array(d),
              f = 0; f < d; f++)
            e[f] = c[f];
          c = e;
        } else
          c = [];
        for (d = 0; d < c.length; d++)
          c[d].zc.apply(c[d].Ma, Array.prototype.slice.call(arguments, 1));
      };
      De.prototype.Eb = function(a, b, c) {
        Ee(this, a);
        this.Oc[a] = this.Oc[a] || [];
        this.Oc[a].push({
          zc: b,
          Ma: c
        });
        (a = this.Ae(a)) && b.apply(c, a);
      };
      De.prototype.ic = function(a, b, c) {
        Ee(this, a);
        a = this.Oc[a] || [];
        for (var d = 0; d < a.length; d++)
          if (a[d].zc === b && (!c || c === a[d].Ma)) {
            a.splice(d, 1);
            break;
          }
      };
      function Ee(a, b) {
        K(Ta(a.Xf, function(a) {
          return a === b;
        }), "Unknown event: " + b);
      }
      ;
      var Fe = function() {
        var a = 0,
            b = [];
        return function(c) {
          var d = c === a;
          a = c;
          for (var e = Array(8),
              f = 7; 0 <= f; f--)
            e[f] = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz".charAt(c % 64), c = Math.floor(c / 64);
          K(0 === c, "Cannot push at time == 0");
          c = e.join("");
          if (d) {
            for (f = 11; 0 <= f && 63 === b[f]; f--)
              b[f] = 0;
            b[f]++;
          } else
            for (f = 0; 12 > f; f++)
              b[f] = Math.floor(64 * Math.random());
          for (f = 0; 12 > f; f++)
            c += "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz".charAt(b[f]);
          K(20 === c.length, "nextPushId: Length should be 20.");
          return c;
        };
      }();
      function Ge() {
        De.call(this, ["online"]);
        this.kc = !0;
        if ("undefined" !== typeof window && "undefined" !== typeof window.addEventListener) {
          var a = this;
          window.addEventListener("online", function() {
            a.kc || (a.kc = !0, a.fe("online", !0));
          }, !1);
          window.addEventListener("offline", function() {
            a.kc && (a.kc = !1, a.fe("online", !1));
          }, !1);
        }
      }
      ma(Ge, De);
      Ge.prototype.Ae = function(a) {
        K("online" === a, "Unknown event type: " + a);
        return [this.kc];
      };
      ca(Ge);
      function He() {
        De.call(this, ["visible"]);
        var a,
            b;
        "undefined" !== typeof document && "undefined" !== typeof document.addEventListener && ("undefined" !== typeof document.hidden ? (b = "visibilitychange", a = "hidden") : "undefined" !== typeof document.mozHidden ? (b = "mozvisibilitychange", a = "mozHidden") : "undefined" !== typeof document.msHidden ? (b = "msvisibilitychange", a = "msHidden") : "undefined" !== typeof document.webkitHidden && (b = "webkitvisibilitychange", a = "webkitHidden"));
        this.Ob = !0;
        if (b) {
          var c = this;
          document.addEventListener(b, function() {
            var b = !document[a];
            b !== c.Ob && (c.Ob = b, c.fe("visible", b));
          }, !1);
        }
      }
      ma(He, De);
      He.prototype.Ae = function(a) {
        K("visible" === a, "Unknown event type: " + a);
        return [this.Ob];
      };
      ca(He);
      function L(a, b) {
        if (1 == arguments.length) {
          this.o = a.split("/");
          for (var c = 0,
              d = 0; d < this.o.length; d++)
            0 < this.o[d].length && (this.o[c] = this.o[d], c++);
          this.o.length = c;
          this.Z = 0;
        } else
          this.o = a, this.Z = b;
      }
      function T(a, b) {
        var c = E(a);
        if (null === c)
          return b;
        if (c === E(b))
          return T(H(a), H(b));
        throw Error("INTERNAL ERROR: innerPath (" + b + ") is not within outerPath (" + a + ")");
      }
      function Ie(a, b) {
        for (var c = a.slice(),
            d = b.slice(),
            e = 0; e < c.length && e < d.length; e++) {
          var f = Vb(c[e], d[e]);
          if (0 !== f)
            return f;
        }
        return c.length === d.length ? 0 : c.length < d.length ? -1 : 1;
      }
      function E(a) {
        return a.Z >= a.o.length ? null : a.o[a.Z];
      }
      function Kd(a) {
        return a.o.length - a.Z;
      }
      function H(a) {
        var b = a.Z;
        b < a.o.length && b++;
        return new L(a.o, b);
      }
      function Ld(a) {
        return a.Z < a.o.length ? a.o[a.o.length - 1] : null;
      }
      g = L.prototype;
      g.toString = function() {
        for (var a = "",
            b = this.Z; b < this.o.length; b++)
          "" !== this.o[b] && (a += "/" + this.o[b]);
        return a || "/";
      };
      g.slice = function(a) {
        return this.o.slice(this.Z + (a || 0));
      };
      g.parent = function() {
        if (this.Z >= this.o.length)
          return null;
        for (var a = [],
            b = this.Z; b < this.o.length - 1; b++)
          a.push(this.o[b]);
        return new L(a, 0);
      };
      g.u = function(a) {
        for (var b = [],
            c = this.Z; c < this.o.length; c++)
          b.push(this.o[c]);
        if (a instanceof L)
          for (c = a.Z; c < a.o.length; c++)
            b.push(a.o[c]);
        else
          for (a = a.split("/"), c = 0; c < a.length; c++)
            0 < a[c].length && b.push(a[c]);
        return new L(b, 0);
      };
      g.e = function() {
        return this.Z >= this.o.length;
      };
      g.ca = function(a) {
        if (Kd(this) !== Kd(a))
          return !1;
        for (var b = this.Z,
            c = a.Z; b <= this.o.length; b++, c++)
          if (this.o[b] !== a.o[c])
            return !1;
        return !0;
      };
      g.contains = function(a) {
        var b = this.Z,
            c = a.Z;
        if (Kd(this) > Kd(a))
          return !1;
        for (; b < this.o.length; ) {
          if (this.o[b] !== a.o[c])
            return !1;
          ++b;
          ++c;
        }
        return !0;
      };
      var G = new L("");
      function Je(a, b) {
        this.Qa = a.slice();
        this.Ha = Math.max(1, this.Qa.length);
        this.lf = b;
        for (var c = 0; c < this.Qa.length; c++)
          this.Ha += Zc(this.Qa[c]);
        Ke(this);
      }
      Je.prototype.push = function(a) {
        0 < this.Qa.length && (this.Ha += 1);
        this.Qa.push(a);
        this.Ha += Zc(a);
        Ke(this);
      };
      Je.prototype.pop = function() {
        var a = this.Qa.pop();
        this.Ha -= Zc(a);
        0 < this.Qa.length && --this.Ha;
      };
      function Ke(a) {
        if (768 < a.Ha)
          throw Error(a.lf + "has a key path longer than 768 bytes (" + a.Ha + ").");
        if (32 < a.Qa.length)
          throw Error(a.lf + "path specified exceeds the maximum depth that can be written (32) or object contains a cycle " + Le(a));
      }
      function Le(a) {
        return 0 == a.Qa.length ? "" : "in property '" + a.Qa.join(".") + "'";
      }
      ;
      function Me(a, b) {
        this.value = a;
        this.children = b || Ne;
      }
      var Ne = new ac(function(a, b) {
        return a === b ? 0 : a < b ? -1 : 1;
      });
      function Oe(a) {
        var b = Pd;
        r(a, function(a, d) {
          b = b.set(new L(d), a);
        });
        return b;
      }
      g = Me.prototype;
      g.e = function() {
        return null === this.value && this.children.e();
      };
      function Pe(a, b, c) {
        if (null != a.value && c(a.value))
          return {
            path: G,
            value: a.value
          };
        if (b.e())
          return null;
        var d = E(b);
        a = a.children.get(d);
        return null !== a ? (b = Pe(a, H(b), c), null != b ? {
          path: (new L(d)).u(b.path),
          value: b.value
        } : null) : null;
      }
      function Qe(a, b) {
        return Pe(a, b, function() {
          return !0;
        });
      }
      g.subtree = function(a) {
        if (a.e())
          return this;
        var b = this.children.get(E(a));
        return null !== b ? b.subtree(H(a)) : Pd;
      };
      g.set = function(a, b) {
        if (a.e())
          return new Me(b, this.children);
        var c = E(a),
            d = (this.children.get(c) || Pd).set(H(a), b),
            c = this.children.Oa(c, d);
        return new Me(this.value, c);
      };
      g.remove = function(a) {
        if (a.e())
          return this.children.e() ? Pd : new Me(null, this.children);
        var b = E(a),
            c = this.children.get(b);
        return c ? (a = c.remove(H(a)), b = a.e() ? this.children.remove(b) : this.children.Oa(b, a), null === this.value && b.e() ? Pd : new Me(this.value, b)) : this;
      };
      g.get = function(a) {
        if (a.e())
          return this.value;
        var b = this.children.get(E(a));
        return b ? b.get(H(a)) : null;
      };
      function Od(a, b, c) {
        if (b.e())
          return c;
        var d = E(b);
        b = Od(a.children.get(d) || Pd, H(b), c);
        d = b.e() ? a.children.remove(d) : a.children.Oa(d, b);
        return new Me(a.value, d);
      }
      function Re(a, b) {
        return Se(a, G, b);
      }
      function Se(a, b, c) {
        var d = {};
        a.children.ia(function(a, f) {
          d[a] = Se(f, b.u(a), c);
        });
        return c(b, a.value, d);
      }
      function Te(a, b, c) {
        return Ue(a, b, G, c);
      }
      function Ue(a, b, c, d) {
        var e = a.value ? d(c, a.value) : !1;
        if (e)
          return e;
        if (b.e())
          return null;
        e = E(b);
        return (a = a.children.get(e)) ? Ue(a, H(b), c.u(e), d) : null;
      }
      function Ve(a, b, c) {
        var d = G;
        if (!b.e()) {
          var e = !0;
          a.value && (e = c(d, a.value));
          !0 === e && (e = E(b), (a = a.children.get(e)) && We(a, H(b), d.u(e), c));
        }
      }
      function We(a, b, c, d) {
        if (b.e())
          return a;
        a.value && d(c, a.value);
        var e = E(b);
        return (a = a.children.get(e)) ? We(a, H(b), c.u(e), d) : Pd;
      }
      function Md(a, b) {
        Xe(a, G, b);
      }
      function Xe(a, b, c) {
        a.children.ia(function(a, e) {
          Xe(e, b.u(a), c);
        });
        a.value && c(b, a.value);
      }
      function Ye(a, b) {
        a.children.ia(function(a, d) {
          d.value && b(a, d.value);
        });
      }
      var Pd = new Me(null);
      Me.prototype.toString = function() {
        var a = {};
        Md(this, function(b, c) {
          a[b.toString()] = c.toString();
        });
        return B(a);
      };
      function Ze(a, b, c) {
        this.type = Ed;
        this.source = $e;
        this.path = a;
        this.Qb = b;
        this.Vd = c;
      }
      Ze.prototype.Xc = function(a) {
        if (this.path.e()) {
          if (null != this.Qb.value)
            return K(this.Qb.children.e(), "affectedTree should not have overlapping affected paths."), this;
          a = this.Qb.subtree(new L(a));
          return new Ze(G, a, this.Vd);
        }
        K(E(this.path) === a, "operationForChild called for unrelated child.");
        return new Ze(H(this.path), this.Qb, this.Vd);
      };
      Ze.prototype.toString = function() {
        return "Operation(" + this.path + ": " + this.source.toString() + " ack write revert=" + this.Vd + " affectedTree=" + this.Qb + ")";
      };
      var Yb = 0,
          Bd = 1,
          Ed = 2,
          $b = 3;
      function af(a, b, c, d) {
        this.we = a;
        this.pf = b;
        this.Hb = c;
        this.af = d;
        K(!d || b, "Tagged queries must be from server.");
      }
      var $e = new af(!0, !1, null, !1),
          bf = new af(!1, !0, null, !1);
      af.prototype.toString = function() {
        return this.we ? "user" : this.af ? "server(queryID=" + this.Hb + ")" : "server";
      };
      function cf(a) {
        this.X = a;
      }
      var df = new cf(new Me(null));
      function ef(a, b, c) {
        if (b.e())
          return new cf(new Me(c));
        var d = Qe(a.X, b);
        if (null != d) {
          var e = d.path,
              d = d.value;
          b = T(e, b);
          d = d.G(b, c);
          return new cf(a.X.set(e, d));
        }
        a = Od(a.X, b, new Me(c));
        return new cf(a);
      }
      function ff(a, b, c) {
        var d = a;
        ib(c, function(a, c) {
          d = ef(d, b.u(a), c);
        });
        return d;
      }
      cf.prototype.Rd = function(a) {
        if (a.e())
          return df;
        a = Od(this.X, a, Pd);
        return new cf(a);
      };
      function gf(a, b) {
        var c = Qe(a.X, b);
        return null != c ? a.X.get(c.path).Q(T(c.path, b)) : null;
      }
      function hf(a) {
        var b = [],
            c = a.X.value;
        null != c ? c.K() || c.P(N, function(a, c) {
          b.push(new F(a, c));
        }) : a.X.children.ia(function(a, c) {
          null != c.value && b.push(new F(a, c.value));
        });
        return b;
      }
      function jf(a, b) {
        if (b.e())
          return a;
        var c = gf(a, b);
        return null != c ? new cf(new Me(c)) : new cf(a.X.subtree(b));
      }
      cf.prototype.e = function() {
        return this.X.e();
      };
      cf.prototype.apply = function(a) {
        return kf(G, this.X, a);
      };
      function kf(a, b, c) {
        if (null != b.value)
          return c.G(a, b.value);
        var d = null;
        b.children.ia(function(b, f) {
          ".priority" === b ? (K(null !== f.value, "Priority writes must always be leaf nodes"), d = f.value) : c = kf(a.u(b), f, c);
        });
        c.Q(a).e() || null === d || (c = c.G(a.u(".priority"), d));
        return c;
      }
      ;
      function lf() {
        this.T = df;
        this.na = [];
        this.Mc = -1;
      }
      function mf(a, b) {
        for (var c = 0; c < a.na.length; c++) {
          var d = a.na[c];
          if (d.kd === b)
            return d;
        }
        return null;
      }
      g = lf.prototype;
      g.Rd = function(a) {
        var b = Ua(this.na, function(b) {
          return b.kd === a;
        });
        K(0 <= b, "removeWrite called with nonexistent writeId.");
        var c = this.na[b];
        this.na.splice(b, 1);
        for (var d = c.visible,
            e = !1,
            f = this.na.length - 1; d && 0 <= f; ) {
          var h = this.na[f];
          h.visible && (f >= b && nf(h, c.path) ? d = !1 : c.path.contains(h.path) && (e = !0));
          f--;
        }
        if (d) {
          if (e)
            this.T = of(this.na, pf, G), this.Mc = 0 < this.na.length ? this.na[this.na.length - 1].kd : -1;
          else if (c.Ga)
            this.T = this.T.Rd(c.path);
          else {
            var k = this;
            r(c.children, function(a, b) {
              k.T = k.T.Rd(c.path.u(b));
            });
          }
          return !0;
        }
        return !1;
      };
      g.za = function(a, b, c, d) {
        if (c || d) {
          var e = jf(this.T, a);
          return !d && e.e() ? b : d || null != b || null != gf(e, G) ? (e = of(this.na, function(b) {
            return (b.visible || d) && (!c || !(0 <= Na(c, b.kd))) && (b.path.contains(a) || a.contains(b.path));
          }, a), b = b || C, e.apply(b)) : null;
        }
        e = gf(this.T, a);
        if (null != e)
          return e;
        e = jf(this.T, a);
        return e.e() ? b : null != b || null != gf(e, G) ? (b = b || C, e.apply(b)) : null;
      };
      g.yc = function(a, b) {
        var c = C,
            d = gf(this.T, a);
        if (d)
          d.K() || d.P(N, function(a, b) {
            c = c.U(a, b);
          });
        else if (b) {
          var e = jf(this.T, a);
          b.P(N, function(a, b) {
            var d = jf(e, new L(a)).apply(b);
            c = c.U(a, d);
          });
          Oa(hf(e), function(a) {
            c = c.U(a.name, a.S);
          });
        } else
          e = jf(this.T, a), Oa(hf(e), function(a) {
            c = c.U(a.name, a.S);
          });
        return c;
      };
      g.ld = function(a, b, c, d) {
        K(c || d, "Either existingEventSnap or existingServerSnap must exist");
        a = a.u(b);
        if (null != gf(this.T, a))
          return null;
        a = jf(this.T, a);
        return a.e() ? d.Q(b) : a.apply(d.Q(b));
      };
      g.xc = function(a, b, c) {
        a = a.u(b);
        var d = gf(this.T, a);
        return null != d ? d : sb(c, b) ? jf(this.T, a).apply(c.j().R(b)) : null;
      };
      g.tc = function(a) {
        return gf(this.T, a);
      };
      g.ne = function(a, b, c, d, e, f) {
        var h;
        a = jf(this.T, a);
        h = gf(a, G);
        if (null == h)
          if (null != b)
            h = a.apply(b);
          else
            return [];
        h = h.lb(f);
        if (h.e() || h.K())
          return [];
        b = [];
        a = td(f);
        e = e ? h.$b(c, f) : h.Yb(c, f);
        for (f = J(e); f && b.length < d; )
          0 !== a(f, c) && b.push(f), f = J(e);
        return b;
      };
      function nf(a, b) {
        return a.Ga ? a.path.contains(b) : !!ua(a.children, function(c, d) {
          return a.path.u(d).contains(b);
        });
      }
      function pf(a) {
        return a.visible;
      }
      function of(a, b, c) {
        for (var d = df,
            e = 0; e < a.length; ++e) {
          var f = a[e];
          if (b(f)) {
            var h = f.path;
            if (f.Ga)
              c.contains(h) ? (h = T(c, h), d = ef(d, h, f.Ga)) : h.contains(c) && (h = T(h, c), d = ef(d, G, f.Ga.Q(h)));
            else if (f.children)
              if (c.contains(h))
                h = T(c, h), d = ff(d, h, f.children);
              else {
                if (h.contains(c))
                  if (h = T(h, c), h.e())
                    d = ff(d, G, f.children);
                  else if (f = w(f.children, E(h)))
                    f = f.Q(H(h)), d = ef(d, G, f);
              }
            else
              throw Fc("WriteRecord should have .snap or .children");
          }
        }
        return d;
      }
      function qf(a, b) {
        this.Mb = a;
        this.X = b;
      }
      g = qf.prototype;
      g.za = function(a, b, c) {
        return this.X.za(this.Mb, a, b, c);
      };
      g.yc = function(a) {
        return this.X.yc(this.Mb, a);
      };
      g.ld = function(a, b, c) {
        return this.X.ld(this.Mb, a, b, c);
      };
      g.tc = function(a) {
        return this.X.tc(this.Mb.u(a));
      };
      g.ne = function(a, b, c, d, e) {
        return this.X.ne(this.Mb, a, b, c, d, e);
      };
      g.xc = function(a, b) {
        return this.X.xc(this.Mb, a, b);
      };
      g.u = function(a) {
        return new qf(this.Mb.u(a), this.X);
      };
      function rf() {
        this.ya = {};
      }
      g = rf.prototype;
      g.e = function() {
        return wa(this.ya);
      };
      g.ab = function(a, b, c) {
        var d = a.source.Hb;
        if (null !== d)
          return d = w(this.ya, d), K(null != d, "SyncTree gave us an op for an invalid query."), d.ab(a, b, c);
        var e = [];
        r(this.ya, function(d) {
          e = e.concat(d.ab(a, b, c));
        });
        return e;
      };
      g.Pb = function(a, b, c, d, e) {
        var f = a.va(),
            h = w(this.ya, f);
        if (!h) {
          var h = c.za(e ? d : null),
              k = !1;
          h ? k = !0 : (h = d instanceof R ? c.yc(d) : C, k = !1);
          h = new ve(a, new Id(new tb(h, k, !1), new tb(d, e, !1)));
          this.ya[f] = h;
        }
        h.Pb(b);
        return ye(h, b);
      };
      g.jb = function(a, b, c) {
        var d = a.va(),
            e = [],
            f = [],
            h = null != sf(this);
        if ("default" === d) {
          var k = this;
          r(this.ya, function(a, d) {
            f = f.concat(a.jb(b, c));
            a.e() && (delete k.ya[d], S(a.W.n) || e.push(a.W));
          });
        } else {
          var l = w(this.ya, d);
          l && (f = f.concat(l.jb(b, c)), l.e() && (delete this.ya[d], S(l.W.n) || e.push(l.W)));
        }
        h && null == sf(this) && e.push(new U(a.k, a.path));
        return {
          Kg: e,
          mg: f
        };
      };
      function tf(a) {
        return Pa(ra(a.ya), function(a) {
          return !S(a.W.n);
        });
      }
      g.fb = function(a) {
        var b = null;
        r(this.ya, function(c) {
          b = b || c.fb(a);
        });
        return b;
      };
      function uf(a, b) {
        if (S(b.n))
          return sf(a);
        var c = b.va();
        return w(a.ya, c);
      }
      function sf(a) {
        return va(a.ya, function(a) {
          return S(a.W.n);
        }) || null;
      }
      ;
      function vf(a) {
        this.ta = Pd;
        this.ib = new lf;
        this.$e = {};
        this.mc = {};
        this.Nc = a;
      }
      function wf(a, b, c, d, e) {
        var f = a.ib,
            h = e;
        K(d > f.Mc, "Stacking an older write on top of newer ones");
        n(h) || (h = !0);
        f.na.push({
          path: b,
          Ga: c,
          kd: d,
          visible: h
        });
        h && (f.T = ef(f.T, b, c));
        f.Mc = d;
        return e ? xf(a, new Xb($e, b, c)) : [];
      }
      function yf(a, b, c, d) {
        var e = a.ib;
        K(d > e.Mc, "Stacking an older merge on top of newer ones");
        e.na.push({
          path: b,
          children: c,
          kd: d,
          visible: !0
        });
        e.T = ff(e.T, b, c);
        e.Mc = d;
        c = Oe(c);
        return xf(a, new ze($e, b, c));
      }
      function zf(a, b, c) {
        c = c || !1;
        var d = mf(a.ib, b);
        if (a.ib.Rd(b)) {
          var e = Pd;
          null != d.Ga ? e = e.set(G, !0) : ib(d.children, function(a, b) {
            e = e.set(new L(a), b);
          });
          return xf(a, new Ze(d.path, e, c));
        }
        return [];
      }
      function Af(a, b, c) {
        c = Oe(c);
        return xf(a, new ze(bf, b, c));
      }
      function Bf(a, b, c, d) {
        d = Cf(a, d);
        if (null != d) {
          var e = Df(d);
          d = e.path;
          e = e.Hb;
          b = T(d, b);
          c = new Xb(new af(!1, !0, e, !0), b, c);
          return Ef(a, d, c);
        }
        return [];
      }
      function Ff(a, b, c, d) {
        if (d = Cf(a, d)) {
          var e = Df(d);
          d = e.path;
          e = e.Hb;
          b = T(d, b);
          c = Oe(c);
          c = new ze(new af(!1, !0, e, !0), b, c);
          return Ef(a, d, c);
        }
        return [];
      }
      vf.prototype.Pb = function(a, b) {
        var c = a.path,
            d = null,
            e = !1;
        Ve(this.ta, c, function(a, b) {
          var f = T(a, c);
          d = b.fb(f);
          e = e || null != sf(b);
          return !d;
        });
        var f = this.ta.get(c);
        f ? (e = e || null != sf(f), d = d || f.fb(G)) : (f = new rf, this.ta = this.ta.set(c, f));
        var h;
        null != d ? h = !0 : (h = !1, d = C, Ye(this.ta.subtree(c), function(a, b) {
          var c = b.fb(G);
          c && (d = d.U(a, c));
        }));
        var k = null != uf(f, a);
        if (!k && !S(a.n)) {
          var l = Gf(a);
          K(!(l in this.mc), "View does not exist, but we have a tag");
          var m = Hf++;
          this.mc[l] = m;
          this.$e["_" + m] = l;
        }
        h = f.Pb(a, b, new qf(c, this.ib), d, h);
        k || e || (f = uf(f, a), h = h.concat(If(this, a, f)));
        return h;
      };
      vf.prototype.jb = function(a, b, c) {
        var d = a.path,
            e = this.ta.get(d),
            f = [];
        if (e && ("default" === a.va() || null != uf(e, a))) {
          f = e.jb(a, b, c);
          e.e() && (this.ta = this.ta.remove(d));
          e = f.Kg;
          f = f.mg;
          b = -1 !== Ua(e, function(a) {
            return S(a.n);
          });
          var h = Te(this.ta, d, function(a, b) {
            return null != sf(b);
          });
          if (b && !h && (d = this.ta.subtree(d), !d.e()))
            for (var d = Jf(d),
                k = 0; k < d.length; ++k) {
              var l = d[k],
                  m = l.W,
                  l = Kf(this, l);
              this.Nc.Xe(Lf(m), Mf(this, m), l.xd, l.H);
            }
          if (!h && 0 < e.length && !c)
            if (b)
              this.Nc.ae(Lf(a), null);
            else {
              var t = this;
              Oa(e, function(a) {
                a.va();
                var b = t.mc[Gf(a)];
                t.Nc.ae(Lf(a), b);
              });
            }
          Nf(this, e);
        }
        return f;
      };
      vf.prototype.za = function(a, b) {
        var c = this.ib,
            d = Te(this.ta, a, function(b, c) {
              var d = T(b, a);
              if (d = c.fb(d))
                return d;
            });
        return c.za(a, d, b, !0);
      };
      function Jf(a) {
        return Re(a, function(a, c, d) {
          if (c && null != sf(c))
            return [sf(c)];
          var e = [];
          c && (e = tf(c));
          r(d, function(a) {
            e = e.concat(a);
          });
          return e;
        });
      }
      function Nf(a, b) {
        for (var c = 0; c < b.length; ++c) {
          var d = b[c];
          if (!S(d.n)) {
            var d = Gf(d),
                e = a.mc[d];
            delete a.mc[d];
            delete a.$e["_" + e];
          }
        }
      }
      function Lf(a) {
        return S(a.n) && !fe(a.n) ? a.Ib() : a;
      }
      function If(a, b, c) {
        var d = b.path,
            e = Mf(a, b);
        c = Kf(a, c);
        b = a.Nc.Xe(Lf(b), e, c.xd, c.H);
        d = a.ta.subtree(d);
        if (e)
          K(null == sf(d.value), "If we're adding a query, it shouldn't be shadowed");
        else
          for (e = Re(d, function(a, b, c) {
            if (!a.e() && b && null != sf(b))
              return [we(sf(b))];
            var d = [];
            b && (d = d.concat(Qa(tf(b), function(a) {
              return a.W;
            })));
            r(c, function(a) {
              d = d.concat(a);
            });
            return d;
          }), d = 0; d < e.length; ++d)
            c = e[d], a.Nc.ae(Lf(c), Mf(a, c));
        return b;
      }
      function Kf(a, b) {
        var c = b.W,
            d = Mf(a, c);
        return {
          xd: function() {
            return (b.w() || C).hash();
          },
          H: function(b) {
            if ("ok" === b) {
              if (d) {
                var f = c.path;
                if (b = Cf(a, d)) {
                  var h = Df(b);
                  b = h.path;
                  h = h.Hb;
                  f = T(b, f);
                  f = new Zb(new af(!1, !0, h, !0), f);
                  b = Ef(a, b, f);
                } else
                  b = [];
              } else
                b = xf(a, new Zb(bf, c.path));
              return b;
            }
            f = "Unknown Error";
            "too_big" === b ? f = "The data requested exceeds the maximum size that can be accessed with a single request." : "permission_denied" == b ? f = "Client doesn't have permission to access the desired data." : "unavailable" == b && (f = "The service is unavailable");
            f = Error(b + ": " + f);
            f.code = b.toUpperCase();
            return a.jb(c, null, f);
          }
        };
      }
      function Gf(a) {
        return a.path.toString() + "$" + a.va();
      }
      function Df(a) {
        var b = a.indexOf("$");
        K(-1 !== b && b < a.length - 1, "Bad queryKey.");
        return {
          Hb: a.substr(b + 1),
          path: new L(a.substr(0, b))
        };
      }
      function Cf(a, b) {
        var c = a.$e,
            d = "_" + b;
        return d in c ? c[d] : void 0;
      }
      function Mf(a, b) {
        var c = Gf(b);
        return w(a.mc, c);
      }
      var Hf = 1;
      function Ef(a, b, c) {
        var d = a.ta.get(b);
        K(d, "Missing sync point for query tag that we're tracking");
        return d.ab(c, new qf(b, a.ib), null);
      }
      function xf(a, b) {
        return Of(a, b, a.ta, null, new qf(G, a.ib));
      }
      function Of(a, b, c, d, e) {
        if (b.path.e())
          return Pf(a, b, c, d, e);
        var f = c.get(G);
        null == d && null != f && (d = f.fb(G));
        var h = [],
            k = E(b.path),
            l = b.Xc(k);
        if ((c = c.children.get(k)) && l)
          var m = d ? d.R(k) : null,
              k = e.u(k),
              h = h.concat(Of(a, l, c, m, k));
        f && (h = h.concat(f.ab(b, e, d)));
        return h;
      }
      function Pf(a, b, c, d, e) {
        var f = c.get(G);
        null == d && null != f && (d = f.fb(G));
        var h = [];
        c.children.ia(function(c, f) {
          var m = d ? d.R(c) : null,
              t = e.u(c),
              z = b.Xc(c);
          z && (h = h.concat(Pf(a, z, f, m, t)));
        });
        f && (h = h.concat(f.ab(b, e, d)));
        return h;
      }
      ;
      function Qf() {
        this.children = {};
        this.nd = 0;
        this.value = null;
      }
      function Rf(a, b, c) {
        this.Gd = a ? a : "";
        this.Zc = b ? b : null;
        this.A = c ? c : new Qf;
      }
      function Sf(a, b) {
        for (var c = b instanceof L ? b : new L(b),
            d = a,
            e; null !== (e = E(c)); )
          d = new Rf(e, d, w(d.A.children, e) || new Qf), c = H(c);
        return d;
      }
      g = Rf.prototype;
      g.Ca = function() {
        return this.A.value;
      };
      function Tf(a, b) {
        K("undefined" !== typeof b, "Cannot set value to undefined");
        a.A.value = b;
        Uf(a);
      }
      g.clear = function() {
        this.A.value = null;
        this.A.children = {};
        this.A.nd = 0;
        Uf(this);
      };
      g.wd = function() {
        return 0 < this.A.nd;
      };
      g.e = function() {
        return null === this.Ca() && !this.wd();
      };
      g.P = function(a) {
        var b = this;
        r(this.A.children, function(c, d) {
          a(new Rf(d, b, c));
        });
      };
      function Vf(a, b, c, d) {
        c && !d && b(a);
        a.P(function(a) {
          Vf(a, b, !0, d);
        });
        c && d && b(a);
      }
      function Wf(a, b) {
        for (var c = a.parent(); null !== c && !b(c); )
          c = c.parent();
      }
      g.path = function() {
        return new L(null === this.Zc ? this.Gd : this.Zc.path() + "/" + this.Gd);
      };
      g.name = function() {
        return this.Gd;
      };
      g.parent = function() {
        return this.Zc;
      };
      function Uf(a) {
        if (null !== a.Zc) {
          var b = a.Zc,
              c = a.Gd,
              d = a.e(),
              e = v(b.A.children, c);
          d && e ? (delete b.A.children[c], b.A.nd--, Uf(b)) : d || e || (b.A.children[c] = a.A, b.A.nd++, Uf(b));
        }
      }
      ;
      var Xf = /[\[\].#$\/\u0000-\u001F\u007F]/,
          Yf = /[\[\].#$\u0000-\u001F\u007F]/,
          Zf = /^[a-zA-Z][a-zA-Z._\-+]+$/;
      function $f(a) {
        return p(a) && 0 !== a.length && !Xf.test(a);
      }
      function ag(a) {
        return null === a || p(a) || ga(a) && !Qc(a) || ia(a) && v(a, ".sv");
      }
      function bg(a, b, c, d) {
        d && !n(b) || cg(y(a, 1, d), b, c);
      }
      function cg(a, b, c) {
        c instanceof L && (c = new Je(c, a));
        if (!n(b))
          throw Error(a + "contains undefined " + Le(c));
        if (ha(b))
          throw Error(a + "contains a function " + Le(c) + " with contents: " + b.toString());
        if (Qc(b))
          throw Error(a + "contains " + b.toString() + " " + Le(c));
        if (p(b) && b.length > 10485760 / 3 && 10485760 < Zc(b))
          throw Error(a + "contains a string greater than 10485760 utf8 bytes " + Le(c) + " ('" + b.substring(0, 50) + "...')");
        if (ia(b)) {
          var d = !1,
              e = !1;
          ib(b, function(b, h) {
            if (".value" === b)
              d = !0;
            else if (".priority" !== b && ".sv" !== b && (e = !0, !$f(b)))
              throw Error(a + " contains an invalid key (" + b + ") " + Le(c) + '.  Keys must be non-empty strings and can\'t contain ".", "#", "$", "/", "[", or "]"');
            c.push(b);
            cg(a, h, c);
            c.pop();
          });
          if (d && e)
            throw Error(a + ' contains ".value" child ' + Le(c) + " in addition to actual children.");
        }
      }
      function dg(a, b) {
        var c,
            d;
        for (c = 0; c < b.length; c++) {
          d = b[c];
          for (var e = d.slice(),
              f = 0; f < e.length; f++)
            if ((".priority" !== e[f] || f !== e.length - 1) && !$f(e[f]))
              throw Error(a + "contains an invalid key (" + e[f] + ") in path " + d.toString() + '. Keys must be non-empty strings and can\'t contain ".", "#", "$", "/", "[", or "]"');
        }
        b.sort(Ie);
        e = null;
        for (c = 0; c < b.length; c++) {
          d = b[c];
          if (null !== e && e.contains(d))
            throw Error(a + "contains a path " + e.toString() + " that is ancestor of another path " + d.toString());
          e = d;
        }
      }
      function eg(a, b, c) {
        var d = y(a, 1, !1);
        if (!ia(b) || ea(b))
          throw Error(d + " must be an object containing the children to replace.");
        var e = [];
        ib(b, function(a, b) {
          var k = new L(a);
          cg(d, b, c.u(k));
          if (".priority" === Ld(k) && !ag(b))
            throw Error(d + "contains an invalid value for '" + k.toString() + "', which must be a valid Firebase priority (a string, finite number, server value, or null).");
          e.push(k);
        });
        dg(d, e);
      }
      function fg(a, b, c) {
        if (Qc(c))
          throw Error(y(a, b, !1) + "is " + c.toString() + ", but must be a valid Firebase priority (a string, finite number, server value, or null).");
        if (!ag(c))
          throw Error(y(a, b, !1) + "must be a valid Firebase priority (a string, finite number, server value, or null).");
      }
      function gg(a, b, c) {
        if (!c || n(b))
          switch (b) {
            case "value":
            case "child_added":
            case "child_removed":
            case "child_changed":
            case "child_moved":
              break;
            default:
              throw Error(y(a, 1, c) + 'must be a valid event type: "value", "child_added", "child_removed", "child_changed", or "child_moved".');
          }
      }
      function hg(a, b) {
        if (n(b) && !$f(b))
          throw Error(y(a, 2, !0) + 'was an invalid key: "' + b + '".  Firebase keys must be non-empty strings and can\'t contain ".", "#", "$", "/", "[", or "]").');
      }
      function ig(a, b) {
        if (!p(b) || 0 === b.length || Yf.test(b))
          throw Error(y(a, 1, !1) + 'was an invalid path: "' + b + '". Paths must be non-empty strings and can\'t contain ".", "#", "$", "[", or "]"');
      }
      function jg(a, b) {
        if (".info" === E(b))
          throw Error(a + " failed: Can't modify data under /.info/");
      }
      function kg(a, b) {
        if (!p(b))
          throw Error(y(a, 1, !1) + "must be a valid credential (a string).");
      }
      function lg(a, b, c) {
        if (!p(c))
          throw Error(y(a, b, !1) + "must be a valid string.");
      }
      function mg(a, b) {
        lg(a, 1, b);
        if (!Zf.test(b))
          throw Error(y(a, 1, !1) + "'" + b + "' is not a valid authentication provider.");
      }
      function ng(a, b, c, d) {
        if (!d || n(c))
          if (!ia(c) || null === c)
            throw Error(y(a, b, d) + "must be a valid object.");
      }
      function og(a, b, c) {
        if (!ia(b) || !v(b, c))
          throw Error(y(a, 1, !1) + 'must contain the key "' + c + '"');
        if (!p(w(b, c)))
          throw Error(y(a, 1, !1) + 'must contain the key "' + c + '" with type "string"');
      }
      ;
      function pg() {
        this.set = {};
      }
      g = pg.prototype;
      g.add = function(a, b) {
        this.set[a] = null !== b ? b : !0;
      };
      g.contains = function(a) {
        return v(this.set, a);
      };
      g.get = function(a) {
        return this.contains(a) ? this.set[a] : void 0;
      };
      g.remove = function(a) {
        delete this.set[a];
      };
      g.clear = function() {
        this.set = {};
      };
      g.e = function() {
        return wa(this.set);
      };
      g.count = function() {
        return pa(this.set);
      };
      function qg(a, b) {
        r(a.set, function(a, d) {
          b(d, a);
        });
      }
      g.keys = function() {
        var a = [];
        r(this.set, function(b, c) {
          a.push(c);
        });
        return a;
      };
      function qc() {
        this.m = this.B = null;
      }
      qc.prototype.find = function(a) {
        if (null != this.B)
          return this.B.Q(a);
        if (a.e() || null == this.m)
          return null;
        var b = E(a);
        a = H(a);
        return this.m.contains(b) ? this.m.get(b).find(a) : null;
      };
      qc.prototype.nc = function(a, b) {
        if (a.e())
          this.B = b, this.m = null;
        else if (null !== this.B)
          this.B = this.B.G(a, b);
        else {
          null == this.m && (this.m = new pg);
          var c = E(a);
          this.m.contains(c) || this.m.add(c, new qc);
          c = this.m.get(c);
          a = H(a);
          c.nc(a, b);
        }
      };
      function rg(a, b) {
        if (b.e())
          return a.B = null, a.m = null, !0;
        if (null !== a.B) {
          if (a.B.K())
            return !1;
          var c = a.B;
          a.B = null;
          c.P(N, function(b, c) {
            a.nc(new L(b), c);
          });
          return rg(a, b);
        }
        return null !== a.m ? (c = E(b), b = H(b), a.m.contains(c) && rg(a.m.get(c), b) && a.m.remove(c), a.m.e() ? (a.m = null, !0) : !1) : !0;
      }
      function rc(a, b, c) {
        null !== a.B ? c(b, a.B) : a.P(function(a, e) {
          var f = new L(b.toString() + "/" + a);
          rc(e, f, c);
        });
      }
      qc.prototype.P = function(a) {
        null !== this.m && qg(this.m, function(b, c) {
          a(b, c);
        });
      };
      var sg = "auth.firebase.com";
      function tg(a, b, c) {
        this.od = a || {};
        this.ee = b || {};
        this.$a = c || {};
        this.od.remember || (this.od.remember = "default");
      }
      var ug = ["remember", "redirectTo"];
      function vg(a) {
        var b = {},
            c = {};
        ib(a || {}, function(a, e) {
          0 <= Na(ug, a) ? b[a] = e : c[a] = e;
        });
        return new tg(b, {}, c);
      }
      ;
      function wg(a, b) {
        this.Qe = ["session", a.Od, a.hc].join(":");
        this.be = b;
      }
      wg.prototype.set = function(a, b) {
        if (!b)
          if (this.be.length)
            b = this.be[0];
          else
            throw Error("fb.login.SessionManager : No storage options available!");
        b.set(this.Qe, a);
      };
      wg.prototype.get = function() {
        var a = Qa(this.be, q(this.qg, this)),
            a = Pa(a, function(a) {
              return null !== a;
            });
        Xa(a, function(a, c) {
          return ad(c.token) - ad(a.token);
        });
        return 0 < a.length ? a.shift() : null;
      };
      wg.prototype.qg = function(a) {
        try {
          var b = a.get(this.Qe);
          if (b && b.token)
            return b;
        } catch (c) {}
        return null;
      };
      wg.prototype.clear = function() {
        var a = this;
        Oa(this.be, function(b) {
          b.remove(a.Qe);
        });
      };
      function xg() {
        return "undefined" !== typeof navigator && "string" === typeof navigator.userAgent ? navigator.userAgent : "";
      }
      function yg() {
        return "undefined" !== typeof window && !!(window.cordova || window.phonegap || window.PhoneGap) && /ios|iphone|ipod|ipad|android|blackberry|iemobile/i.test(xg());
      }
      function zg() {
        return "undefined" !== typeof location && /^file:\//.test(location.href);
      }
      function Ag(a) {
        var b = xg();
        if ("" === b)
          return !1;
        if ("Microsoft Internet Explorer" === navigator.appName) {
          if ((b = b.match(/MSIE ([0-9]{1,}[\.0-9]{0,})/)) && 1 < b.length)
            return parseFloat(b[1]) >= a;
        } else if (-1 < b.indexOf("Trident") && (b = b.match(/rv:([0-9]{2,2}[\.0-9]{0,})/)) && 1 < b.length)
          return parseFloat(b[1]) >= a;
        return !1;
      }
      ;
      function Bg() {
        var a = window.opener.frames,
            b;
        for (b = a.length - 1; 0 <= b; b--)
          try {
            if (a[b].location.protocol === window.location.protocol && a[b].location.host === window.location.host && "__winchan_relay_frame" === a[b].name)
              return a[b];
          } catch (c) {}
        return null;
      }
      function Cg(a, b, c) {
        a.attachEvent ? a.attachEvent("on" + b, c) : a.addEventListener && a.addEventListener(b, c, !1);
      }
      function Dg(a, b, c) {
        a.detachEvent ? a.detachEvent("on" + b, c) : a.removeEventListener && a.removeEventListener(b, c, !1);
      }
      function Eg(a) {
        /^https?:\/\//.test(a) || (a = window.location.href);
        var b = /^(https?:\/\/[\-_a-zA-Z\.0-9:]+)/.exec(a);
        return b ? b[1] : a;
      }
      function Fg(a) {
        var b = "";
        try {
          a = a.replace("#", "");
          var c = lb(a);
          c && v(c, "__firebase_request_key") && (b = w(c, "__firebase_request_key"));
        } catch (d) {}
        return b;
      }
      function Gg() {
        var a = Pc(sg);
        return a.scheme + "://" + a.host + "/v2";
      }
      function Hg(a) {
        return Gg() + "/" + a + "/auth/channel";
      }
      ;
      function Ig(a) {
        var b = this;
        this.Ac = a;
        this.ce = "*";
        Ag(8) ? this.Rc = this.zd = Bg() : (this.Rc = window.opener, this.zd = window);
        if (!b.Rc)
          throw "Unable to find relay frame";
        Cg(this.zd, "message", q(this.jc, this));
        Cg(this.zd, "message", q(this.Bf, this));
        try {
          Jg(this, {a: "ready"});
        } catch (c) {
          Cg(this.Rc, "load", function() {
            Jg(b, {a: "ready"});
          });
        }
        Cg(window, "unload", q(this.Bg, this));
      }
      function Jg(a, b) {
        b = B(b);
        Ag(8) ? a.Rc.doPost(b, a.ce) : a.Rc.postMessage(b, a.ce);
      }
      Ig.prototype.jc = function(a) {
        var b = this,
            c;
        try {
          c = nb(a.data);
        } catch (d) {}
        c && "request" === c.a && (Dg(window, "message", this.jc), this.ce = a.origin, this.Ac && setTimeout(function() {
          b.Ac(b.ce, c.d, function(a, c) {
            b.dg = !c;
            b.Ac = void 0;
            Jg(b, {
              a: "response",
              d: a,
              forceKeepWindowOpen: c
            });
          });
        }, 0));
      };
      Ig.prototype.Bg = function() {
        try {
          Dg(this.zd, "message", this.Bf);
        } catch (a) {}
        this.Ac && (Jg(this, {
          a: "error",
          d: "unknown closed window"
        }), this.Ac = void 0);
        try {
          window.close();
        } catch (b) {}
      };
      Ig.prototype.Bf = function(a) {
        if (this.dg && "die" === a.data)
          try {
            window.close();
          } catch (b) {}
      };
      function Kg(a) {
        this.pc = Ga() + Ga() + Ga();
        this.Ef = a;
      }
      Kg.prototype.open = function(a, b) {
        yc.set("redirect_request_id", this.pc);
        yc.set("redirect_request_id", this.pc);
        b.requestId = this.pc;
        b.redirectTo = b.redirectTo || window.location.href;
        a += (/\?/.test(a) ? "" : "?") + kb(b);
        window.location = a;
      };
      Kg.isAvailable = function() {
        return !zg() && !yg();
      };
      Kg.prototype.Cc = function() {
        return "redirect";
      };
      var Lg = {
        NETWORK_ERROR: "Unable to contact the Firebase server.",
        SERVER_ERROR: "An unknown server error occurred.",
        TRANSPORT_UNAVAILABLE: "There are no login transports available for the requested method.",
        REQUEST_INTERRUPTED: "The browser redirected the page before the login request could complete.",
        USER_CANCELLED: "The user cancelled authentication."
      };
      function Mg(a) {
        var b = Error(w(Lg, a), a);
        b.code = a;
        return b;
      }
      ;
      function Ng(a) {
        var b;
        (b = !a.window_features) || (b = xg(), b = -1 !== b.indexOf("Fennec/") || -1 !== b.indexOf("Firefox/") && -1 !== b.indexOf("Android"));
        b && (a.window_features = void 0);
        a.window_name || (a.window_name = "_blank");
        this.options = a;
      }
      Ng.prototype.open = function(a, b, c) {
        function d(a) {
          h && (document.body.removeChild(h), h = void 0);
          t && (t = clearInterval(t));
          Dg(window, "message", e);
          Dg(window, "unload", d);
          if (m && !a)
            try {
              m.close();
            } catch (b) {
              k.postMessage("die", l);
            }
          m = k = void 0;
        }
        function e(a) {
          if (a.origin === l)
            try {
              var b = nb(a.data);
              "ready" === b.a ? k.postMessage(z, l) : "error" === b.a ? (d(!1), c && (c(b.d), c = null)) : "response" === b.a && (d(b.forceKeepWindowOpen), c && (c(null, b.d), c = null));
            } catch (e) {}
        }
        var f = Ag(8),
            h,
            k;
        if (!this.options.relay_url)
          return c(Error("invalid arguments: origin of url and relay_url must match"));
        var l = Eg(a);
        if (l !== Eg(this.options.relay_url))
          c && setTimeout(function() {
            c(Error("invalid arguments: origin of url and relay_url must match"));
          }, 0);
        else {
          f && (h = document.createElement("iframe"), h.setAttribute("src", this.options.relay_url), h.style.display = "none", h.setAttribute("name", "__winchan_relay_frame"), document.body.appendChild(h), k = h.contentWindow);
          a += (/\?/.test(a) ? "" : "?") + kb(b);
          var m = window.open(a, this.options.window_name, this.options.window_features);
          k || (k = m);
          var t = setInterval(function() {
            m && m.closed && (d(!1), c && (c(Mg("USER_CANCELLED")), c = null));
          }, 500),
              z = B({
                a: "request",
                d: b
              });
          Cg(window, "unload", d);
          Cg(window, "message", e);
        }
      };
      Ng.isAvailable = function() {
        var a;
        if (a = "postMessage" in window && !zg())
          (a = yg() || "undefined" !== typeof navigator && (!!xg().match(/Windows Phone/) || !!window.Windows && /^ms-appx:/.test(location.href))) || (a = xg(), a = "undefined" !== typeof navigator && "undefined" !== typeof window && !!(a.match(/(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i) || a.match(/CriOS/) || a.match(/Twitter for iPhone/) || a.match(/FBAN\/FBIOS/) || window.navigator.standalone)), a = !a;
        return a && !xg().match(/PhantomJS/);
      };
      Ng.prototype.Cc = function() {
        return "popup";
      };
      function Og(a) {
        a.method || (a.method = "GET");
        a.headers || (a.headers = {});
        a.headers.content_type || (a.headers.content_type = "application/json");
        a.headers.content_type = a.headers.content_type.toLowerCase();
        this.options = a;
      }
      Og.prototype.open = function(a, b, c) {
        function d() {
          c && (c(Mg("REQUEST_INTERRUPTED")), c = null);
        }
        var e = new XMLHttpRequest,
            f = this.options.method.toUpperCase(),
            h;
        Cg(window, "beforeunload", d);
        e.onreadystatechange = function() {
          if (c && 4 === e.readyState) {
            var a;
            if (200 <= e.status && 300 > e.status) {
              try {
                a = nb(e.responseText);
              } catch (b) {}
              c(null, a);
            } else
              500 <= e.status && 600 > e.status ? c(Mg("SERVER_ERROR")) : c(Mg("NETWORK_ERROR"));
            c = null;
            Dg(window, "beforeunload", d);
          }
        };
        if ("GET" === f)
          a += (/\?/.test(a) ? "" : "?") + kb(b), h = null;
        else {
          var k = this.options.headers.content_type;
          "application/json" === k && (h = B(b));
          "application/x-www-form-urlencoded" === k && (h = kb(b));
        }
        e.open(f, a, !0);
        a = {
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json;text/plain"
        };
        za(a, this.options.headers);
        for (var l in a)
          e.setRequestHeader(l, a[l]);
        e.send(h);
      };
      Og.isAvailable = function() {
        var a;
        if (a = !!window.XMLHttpRequest)
          a = xg(), a = !(a.match(/MSIE/) || a.match(/Trident/)) || Ag(10);
        return a;
      };
      Og.prototype.Cc = function() {
        return "json";
      };
      function Pg(a) {
        this.pc = Ga() + Ga() + Ga();
        this.Ef = a;
      }
      Pg.prototype.open = function(a, b, c) {
        function d() {
          c && (c(Mg("USER_CANCELLED")), c = null);
        }
        var e = this,
            f = Pc(sg),
            h;
        b.requestId = this.pc;
        b.redirectTo = f.scheme + "://" + f.host + "/blank/page.html";
        a += /\?/.test(a) ? "" : "?";
        a += kb(b);
        (h = window.open(a, "_blank", "location=no")) && ha(h.addEventListener) ? (h.addEventListener("loadstart", function(a) {
          var b;
          if (b = a && a.url)
            a: {
              try {
                var m = document.createElement("a");
                m.href = a.url;
                b = m.host === f.host && "/blank/page.html" === m.pathname;
                break a;
              } catch (t) {}
              b = !1;
            }
          b && (a = Fg(a.url), h.removeEventListener("exit", d), h.close(), a = new tg(null, null, {
            requestId: e.pc,
            requestKey: a
          }), e.Ef.requestWithCredential("/auth/session", a, c), c = null);
        }), h.addEventListener("exit", d)) : c(Mg("TRANSPORT_UNAVAILABLE"));
      };
      Pg.isAvailable = function() {
        return yg();
      };
      Pg.prototype.Cc = function() {
        return "redirect";
      };
      function Qg(a) {
        a.callback_parameter || (a.callback_parameter = "callback");
        this.options = a;
        window.__firebase_auth_jsonp = window.__firebase_auth_jsonp || {};
      }
      Qg.prototype.open = function(a, b, c) {
        function d() {
          c && (c(Mg("REQUEST_INTERRUPTED")), c = null);
        }
        function e() {
          setTimeout(function() {
            window.__firebase_auth_jsonp[f] = void 0;
            wa(window.__firebase_auth_jsonp) && (window.__firebase_auth_jsonp = void 0);
            try {
              var a = document.getElementById(f);
              a && a.parentNode.removeChild(a);
            } catch (b) {}
          }, 1);
          Dg(window, "beforeunload", d);
        }
        var f = "fn" + (new Date).getTime() + Math.floor(99999 * Math.random());
        b[this.options.callback_parameter] = "__firebase_auth_jsonp." + f;
        a += (/\?/.test(a) ? "" : "?") + kb(b);
        Cg(window, "beforeunload", d);
        window.__firebase_auth_jsonp[f] = function(a) {
          c && (c(null, a), c = null);
          e();
        };
        Rg(f, a, c);
      };
      function Rg(a, b, c) {
        setTimeout(function() {
          try {
            var d = document.createElement("script");
            d.type = "text/javascript";
            d.id = a;
            d.async = !0;
            d.src = b;
            d.onerror = function() {
              var b = document.getElementById(a);
              null !== b && b.parentNode.removeChild(b);
              c && c(Mg("NETWORK_ERROR"));
            };
            var e = document.getElementsByTagName("head");
            (e && 0 != e.length ? e[0] : document.documentElement).appendChild(d);
          } catch (f) {
            c && c(Mg("NETWORK_ERROR"));
          }
        }, 0);
      }
      Qg.isAvailable = function() {
        return "undefined" !== typeof document && null != document.createElement;
      };
      Qg.prototype.Cc = function() {
        return "json";
      };
      function Sg(a, b, c, d) {
        De.call(this, ["auth_status"]);
        this.F = a;
        this.df = b;
        this.Vg = c;
        this.Le = d;
        this.sc = new wg(a, [xc, yc]);
        this.mb = null;
        this.Se = !1;
        Tg(this);
      }
      ma(Sg, De);
      g = Sg.prototype;
      g.xe = function() {
        return this.mb || null;
      };
      function Tg(a) {
        yc.get("redirect_request_id") && Ug(a);
        var b = a.sc.get();
        b && b.token ? (Vg(a, b), a.df(b.token, function(c, d) {
          Wg(a, c, d, !1, b.token, b);
        }, function(b, d) {
          Xg(a, "resumeSession()", b, d);
        })) : Vg(a, null);
      }
      function Yg(a, b, c, d, e, f) {
        "firebaseio-demo.com" === a.F.domain && O("Firebase authentication is not supported on demo Firebases (*.firebaseio-demo.com). To secure your Firebase, create a production Firebase at https://www.firebase.com.");
        a.df(b, function(f, k) {
          Wg(a, f, k, !0, b, c, d || {}, e);
        }, function(b, c) {
          Xg(a, "auth()", b, c, f);
        });
      }
      function Zg(a, b) {
        a.sc.clear();
        Vg(a, null);
        a.Vg(function(a, d) {
          if ("ok" === a)
            P(b, null);
          else {
            var e = (a || "error").toUpperCase(),
                f = e;
            d && (f += ": " + d);
            f = Error(f);
            f.code = e;
            P(b, f);
          }
        });
      }
      function Wg(a, b, c, d, e, f, h, k) {
        "ok" === b ? (d && (b = c.auth, f.auth = b, f.expires = c.expires, f.token = bd(e) ? e : "", c = null, b && v(b, "uid") ? c = w(b, "uid") : v(f, "uid") && (c = w(f, "uid")), f.uid = c, c = "custom", b && v(b, "provider") ? c = w(b, "provider") : v(f, "provider") && (c = w(f, "provider")), f.provider = c, a.sc.clear(), bd(e) && (h = h || {}, c = xc, "sessionOnly" === h.remember && (c = yc), "none" !== h.remember && a.sc.set(f, c)), Vg(a, f)), P(k, null, f)) : (a.sc.clear(), Vg(a, null), f = a = (b || "error").toUpperCase(), c && (f += ": " + c), f = Error(f), f.code = a, P(k, f));
      }
      function Xg(a, b, c, d, e) {
        O(b + " was canceled: " + d);
        a.sc.clear();
        Vg(a, null);
        a = Error(d);
        a.code = c.toUpperCase();
        P(e, a);
      }
      function $g(a, b, c, d, e) {
        ah(a);
        c = new tg(d || {}, {}, c || {});
        bh(a, [Og, Qg], "/auth/" + b, c, e);
      }
      function ch(a, b, c, d) {
        ah(a);
        var e = [Ng, Pg];
        c = vg(c);
        "anonymous" === b || "password" === b ? setTimeout(function() {
          P(d, Mg("TRANSPORT_UNAVAILABLE"));
        }, 0) : (c.ee.window_features = "menubar=yes,modal=yes,alwaysRaised=yeslocation=yes,resizable=yes,scrollbars=yes,status=yes,height=625,width=625,top=" + ("object" === typeof screen ? .5 * (screen.height - 625) : 0) + ",left=" + ("object" === typeof screen ? .5 * (screen.width - 625) : 0), c.ee.relay_url = Hg(a.F.hc), c.ee.requestWithCredential = q(a.qc, a), bh(a, e, "/auth/" + b, c, d));
      }
      function Ug(a) {
        var b = yc.get("redirect_request_id");
        if (b) {
          var c = yc.get("redirect_client_options");
          yc.remove("redirect_request_id");
          yc.remove("redirect_client_options");
          var d = [Og, Qg],
              b = {
                requestId: b,
                requestKey: Fg(document.location.hash)
              },
              c = new tg(c, {}, b);
          a.Se = !0;
          try {
            document.location.hash = document.location.hash.replace(/&__firebase_request_key=([a-zA-z0-9]*)/, "");
          } catch (e) {}
          bh(a, d, "/auth/session", c, function() {
            this.Se = !1;
          }.bind(a));
        }
      }
      g.se = function(a, b) {
        ah(this);
        var c = vg(a);
        c.$a._method = "POST";
        this.qc("/users", c, function(a, c) {
          a ? P(b, a) : P(b, a, c);
        });
      };
      g.Te = function(a, b) {
        var c = this;
        ah(this);
        var d = "/users/" + encodeURIComponent(a.email),
            e = vg(a);
        e.$a._method = "DELETE";
        this.qc(d, e, function(a, d) {
          !a && d && d.uid && c.mb && c.mb.uid && c.mb.uid === d.uid && Zg(c);
          P(b, a);
        });
      };
      g.pe = function(a, b) {
        ah(this);
        var c = "/users/" + encodeURIComponent(a.email) + "/password",
            d = vg(a);
        d.$a._method = "PUT";
        d.$a.password = a.newPassword;
        this.qc(c, d, function(a) {
          P(b, a);
        });
      };
      g.oe = function(a, b) {
        ah(this);
        var c = "/users/" + encodeURIComponent(a.oldEmail) + "/email",
            d = vg(a);
        d.$a._method = "PUT";
        d.$a.email = a.newEmail;
        d.$a.password = a.password;
        this.qc(c, d, function(a) {
          P(b, a);
        });
      };
      g.Ve = function(a, b) {
        ah(this);
        var c = "/users/" + encodeURIComponent(a.email) + "/password",
            d = vg(a);
        d.$a._method = "POST";
        this.qc(c, d, function(a) {
          P(b, a);
        });
      };
      g.qc = function(a, b, c) {
        dh(this, [Og, Qg], a, b, c);
      };
      function bh(a, b, c, d, e) {
        dh(a, b, c, d, function(b, c) {
          !b && c && c.token && c.uid ? Yg(a, c.token, c, d.od, function(a, b) {
            a ? P(e, a) : P(e, null, b);
          }) : P(e, b || Mg("UNKNOWN_ERROR"));
        });
      }
      function dh(a, b, c, d, e) {
        b = Pa(b, function(a) {
          return "function" === typeof a.isAvailable && a.isAvailable();
        });
        0 === b.length ? setTimeout(function() {
          P(e, Mg("TRANSPORT_UNAVAILABLE"));
        }, 0) : (b = new (b.shift())(d.ee), d = jb(d.$a), d.v = "js-" + hb, d.transport = b.Cc(), d.suppress_status_codes = !0, a = Gg() + "/" + a.F.hc + c, b.open(a, d, function(a, b) {
          if (a)
            P(e, a);
          else if (b && b.error) {
            var c = Error(b.error.message);
            c.code = b.error.code;
            c.details = b.error.details;
            P(e, c);
          } else
            P(e, null, b);
        }));
      }
      function Vg(a, b) {
        var c = null !== a.mb || null !== b;
        a.mb = b;
        c && a.fe("auth_status", b);
        a.Le(null !== b);
      }
      g.Ae = function(a) {
        K("auth_status" === a, 'initial event must be of type "auth_status"');
        return this.Se ? null : [this.mb];
      };
      function ah(a) {
        var b = a.F;
        if ("firebaseio.com" !== b.domain && "firebaseio-demo.com" !== b.domain && "auth.firebase.com" === sg)
          throw Error("This custom Firebase server ('" + a.F.domain + "') does not support delegated login.");
      }
      ;
      var Cc = "websocket",
          Dc = "long_polling";
      function eh(a) {
        this.jc = a;
        this.Nd = [];
        this.Sb = 0;
        this.qe = -1;
        this.Fb = null;
      }
      function fh(a, b, c) {
        a.qe = b;
        a.Fb = c;
        a.qe < a.Sb && (a.Fb(), a.Fb = null);
      }
      function gh(a, b, c) {
        for (a.Nd[b] = c; a.Nd[a.Sb]; ) {
          var d = a.Nd[a.Sb];
          delete a.Nd[a.Sb];
          for (var e = 0; e < d.length; ++e)
            if (d[e]) {
              var f = a;
              Db(function() {
                f.jc(d[e]);
              });
            }
          if (a.Sb === a.qe) {
            a.Fb && (clearTimeout(a.Fb), a.Fb(), a.Fb = null);
            break;
          }
          a.Sb++;
        }
      }
      ;
      function hh(a, b, c, d) {
        this.re = a;
        this.f = Mc(a);
        this.nb = this.ob = 0;
        this.Ua = Rb(b);
        this.Qf = c;
        this.Hc = !1;
        this.Bb = d;
        this.jd = function(a) {
          return Bc(b, Dc, a);
        };
      }
      var ih,
          jh;
      hh.prototype.open = function(a, b) {
        this.hf = 0;
        this.la = b;
        this.Af = new eh(a);
        this.zb = !1;
        var c = this;
        this.qb = setTimeout(function() {
          c.f("Timed out trying to connect.");
          c.gb();
          c.qb = null;
        }, Math.floor(3E4));
        Rc(function() {
          if (!c.zb) {
            c.Sa = new kh(function(a, b, d, k, l) {
              lh(c, arguments);
              if (c.Sa)
                if (c.qb && (clearTimeout(c.qb), c.qb = null), c.Hc = !0, "start" == a)
                  c.id = b, c.Gf = d;
                else if ("close" === a)
                  b ? (c.Sa.Xd = !1, fh(c.Af, b, function() {
                    c.gb();
                  })) : c.gb();
                else
                  throw Error("Unrecognized command received: " + a);
            }, function(a, b) {
              lh(c, arguments);
              gh(c.Af, a, b);
            }, function() {
              c.gb();
            }, c.jd);
            var a = {start: "t"};
            a.ser = Math.floor(1E8 * Math.random());
            c.Sa.he && (a.cb = c.Sa.he);
            a.v = "5";
            c.Qf && (a.s = c.Qf);
            c.Bb && (a.ls = c.Bb);
            "undefined" !== typeof location && location.href && -1 !== location.href.indexOf("firebaseio.com") && (a.r = "f");
            a = c.jd(a);
            c.f("Connecting via long-poll to " + a);
            mh(c.Sa, a, function() {});
          }
        });
      };
      hh.prototype.start = function() {
        var a = this.Sa,
            b = this.Gf;
        a.ug = this.id;
        a.vg = b;
        for (a.le = !0; nh(a); )
          ;
        a = this.id;
        b = this.Gf;
        this.gc = document.createElement("iframe");
        var c = {dframe: "t"};
        c.id = a;
        c.pw = b;
        this.gc.src = this.jd(c);
        this.gc.style.display = "none";
        document.body.appendChild(this.gc);
      };
      hh.isAvailable = function() {
        return ih || !jh && "undefined" !== typeof document && null != document.createElement && !("object" === typeof window && window.chrome && window.chrome.extension && !/^chrome/.test(window.location.href)) && !("object" === typeof Windows && "object" === typeof Windows.Xg) && !0;
      };
      g = hh.prototype;
      g.Ed = function() {};
      g.dd = function() {
        this.zb = !0;
        this.Sa && (this.Sa.close(), this.Sa = null);
        this.gc && (document.body.removeChild(this.gc), this.gc = null);
        this.qb && (clearTimeout(this.qb), this.qb = null);
      };
      g.gb = function() {
        this.zb || (this.f("Longpoll is closing itself"), this.dd(), this.la && (this.la(this.Hc), this.la = null));
      };
      g.close = function() {
        this.zb || (this.f("Longpoll is being closed."), this.dd());
      };
      g.send = function(a) {
        a = B(a);
        this.ob += a.length;
        Ob(this.Ua, "bytes_sent", a.length);
        a = Ic(a);
        a = fb(a, !0);
        a = Vc(a, 1840);
        for (var b = 0; b < a.length; b++) {
          var c = this.Sa;
          c.ad.push({
            Mg: this.hf,
            Ug: a.length,
            kf: a[b]
          });
          c.le && nh(c);
          this.hf++;
        }
      };
      function lh(a, b) {
        var c = B(b).length;
        a.nb += c;
        Ob(a.Ua, "bytes_received", c);
      }
      function kh(a, b, c, d) {
        this.jd = d;
        this.hb = c;
        this.Pe = new pg;
        this.ad = [];
        this.te = Math.floor(1E8 * Math.random());
        this.Xd = !0;
        this.he = Ec();
        window["pLPCommand" + this.he] = a;
        window["pRTLPCB" + this.he] = b;
        a = document.createElement("iframe");
        a.style.display = "none";
        if (document.body) {
          document.body.appendChild(a);
          try {
            a.contentWindow.document || Cb("No IE domain setting required");
          } catch (e) {
            a.src = "javascript:void((function(){document.open();document.domain='" + document.domain + "';document.close();})())";
          }
        } else
          throw "Document body has not initialized. Wait to initialize Firebase until after the document is ready.";
        a.contentDocument ? a.eb = a.contentDocument : a.contentWindow ? a.eb = a.contentWindow.document : a.document && (a.eb = a.document);
        this.Ea = a;
        a = "";
        this.Ea.src && "javascript:" === this.Ea.src.substr(0, 11) && (a = '<script>document.domain="' + document.domain + '";\x3c/script>');
        a = "<html><body>" + a + "</body></html>";
        try {
          this.Ea.eb.open(), this.Ea.eb.write(a), this.Ea.eb.close();
        } catch (f) {
          Cb("frame writing exception"), f.stack && Cb(f.stack), Cb(f);
        }
      }
      kh.prototype.close = function() {
        this.le = !1;
        if (this.Ea) {
          this.Ea.eb.body.innerHTML = "";
          var a = this;
          setTimeout(function() {
            null !== a.Ea && (document.body.removeChild(a.Ea), a.Ea = null);
          }, Math.floor(0));
        }
        var b = this.hb;
        b && (this.hb = null, b());
      };
      function nh(a) {
        if (a.le && a.Xd && a.Pe.count() < (0 < a.ad.length ? 2 : 1)) {
          a.te++;
          var b = {};
          b.id = a.ug;
          b.pw = a.vg;
          b.ser = a.te;
          for (var b = a.jd(b),
              c = "",
              d = 0; 0 < a.ad.length; )
            if (1870 >= a.ad[0].kf.length + 30 + c.length) {
              var e = a.ad.shift(),
                  c = c + "&seg" + d + "=" + e.Mg + "&ts" + d + "=" + e.Ug + "&d" + d + "=" + e.kf;
              d++;
            } else
              break;
          oh(a, b + c, a.te);
          return !0;
        }
        return !1;
      }
      function oh(a, b, c) {
        function d() {
          a.Pe.remove(c);
          nh(a);
        }
        a.Pe.add(c, 1);
        var e = setTimeout(d, Math.floor(25E3));
        mh(a, b, function() {
          clearTimeout(e);
          d();
        });
      }
      function mh(a, b, c) {
        setTimeout(function() {
          try {
            if (a.Xd) {
              var d = a.Ea.eb.createElement("script");
              d.type = "text/javascript";
              d.async = !0;
              d.src = b;
              d.onload = d.onreadystatechange = function() {
                var a = d.readyState;
                a && "loaded" !== a && "complete" !== a || (d.onload = d.onreadystatechange = null, d.parentNode && d.parentNode.removeChild(d), c());
              };
              d.onerror = function() {
                Cb("Long-poll script failed to load: " + b);
                a.Xd = !1;
                a.close();
              };
              a.Ea.eb.body.appendChild(d);
            }
          } catch (e) {}
        }, Math.floor(1));
      }
      ;
      var ph = null;
      "undefined" !== typeof MozWebSocket ? ph = MozWebSocket : "undefined" !== typeof WebSocket && (ph = WebSocket);
      function qh(a, b, c, d) {
        this.re = a;
        this.f = Mc(this.re);
        this.frames = this.Kc = null;
        this.nb = this.ob = this.bf = 0;
        this.Ua = Rb(b);
        a = {v: "5"};
        "undefined" !== typeof location && location.href && -1 !== location.href.indexOf("firebaseio.com") && (a.r = "f");
        c && (a.s = c);
        d && (a.ls = d);
        this.ef = Bc(b, Cc, a);
      }
      var rh;
      qh.prototype.open = function(a, b) {
        this.hb = b;
        this.zg = a;
        this.f("Websocket connecting to " + this.ef);
        this.Hc = !1;
        xc.set("previous_websocket_failure", !0);
        try {
          this.ua = new ph(this.ef);
        } catch (c) {
          this.f("Error instantiating WebSocket.");
          var d = c.message || c.data;
          d && this.f(d);
          this.gb();
          return;
        }
        var e = this;
        this.ua.onopen = function() {
          e.f("Websocket connected.");
          e.Hc = !0;
        };
        this.ua.onclose = function() {
          e.f("Websocket connection was disconnected.");
          e.ua = null;
          e.gb();
        };
        this.ua.onmessage = function(a) {
          if (null !== e.ua)
            if (a = a.data, e.nb += a.length, Ob(e.Ua, "bytes_received", a.length), sh(e), null !== e.frames)
              th(e, a);
            else {
              a: {
                K(null === e.frames, "We already have a frame buffer");
                if (6 >= a.length) {
                  var b = Number(a);
                  if (!isNaN(b)) {
                    e.bf = b;
                    e.frames = [];
                    a = null;
                    break a;
                  }
                }
                e.bf = 1;
                e.frames = [];
              }
              null !== a && th(e, a);
            }
        };
        this.ua.onerror = function(a) {
          e.f("WebSocket error.  Closing connection.");
          (a = a.message || a.data) && e.f(a);
          e.gb();
        };
      };
      qh.prototype.start = function() {};
      qh.isAvailable = function() {
        var a = !1;
        if ("undefined" !== typeof navigator && navigator.userAgent) {
          var b = navigator.userAgent.match(/Android ([0-9]{0,}\.[0-9]{0,})/);
          b && 1 < b.length && 4.4 > parseFloat(b[1]) && (a = !0);
        }
        return !a && null !== ph && !rh;
      };
      qh.responsesRequiredToBeHealthy = 2;
      qh.healthyTimeout = 3E4;
      g = qh.prototype;
      g.Ed = function() {
        xc.remove("previous_websocket_failure");
      };
      function th(a, b) {
        a.frames.push(b);
        if (a.frames.length == a.bf) {
          var c = a.frames.join("");
          a.frames = null;
          c = nb(c);
          a.zg(c);
        }
      }
      g.send = function(a) {
        sh(this);
        a = B(a);
        this.ob += a.length;
        Ob(this.Ua, "bytes_sent", a.length);
        a = Vc(a, 16384);
        1 < a.length && this.ua.send(String(a.length));
        for (var b = 0; b < a.length; b++)
          this.ua.send(a[b]);
      };
      g.dd = function() {
        this.zb = !0;
        this.Kc && (clearInterval(this.Kc), this.Kc = null);
        this.ua && (this.ua.close(), this.ua = null);
      };
      g.gb = function() {
        this.zb || (this.f("WebSocket is closing itself"), this.dd(), this.hb && (this.hb(this.Hc), this.hb = null));
      };
      g.close = function() {
        this.zb || (this.f("WebSocket is being closed"), this.dd());
      };
      function sh(a) {
        clearInterval(a.Kc);
        a.Kc = setInterval(function() {
          a.ua && a.ua.send("0");
          sh(a);
        }, Math.floor(45E3));
      }
      ;
      function uh(a) {
        vh(this, a);
      }
      var wh = [hh, qh];
      function vh(a, b) {
        var c = qh && qh.isAvailable(),
            d = c && !(xc.wf || !0 === xc.get("previous_websocket_failure"));
        b.Wg && (c || O("wss:// URL used, but browser isn't known to support websockets.  Trying anyway."), d = !0);
        if (d)
          a.gd = [qh];
        else {
          var e = a.gd = [];
          Wc(wh, function(a, b) {
            b && b.isAvailable() && e.push(b);
          });
        }
      }
      function xh(a) {
        if (0 < a.gd.length)
          return a.gd[0];
        throw Error("No transports available");
      }
      ;
      function yh(a, b, c, d, e, f, h) {
        this.id = a;
        this.f = Mc("c:" + this.id + ":");
        this.jc = c;
        this.Wc = d;
        this.la = e;
        this.Ne = f;
        this.F = b;
        this.Md = [];
        this.ff = 0;
        this.Pf = new uh(b);
        this.Ta = 0;
        this.Bb = h;
        this.f("Connection created");
        zh(this);
      }
      function zh(a) {
        var b = xh(a.Pf);
        a.J = new b("c:" + a.id + ":" + a.ff++, a.F, void 0, a.Bb);
        a.Re = b.responsesRequiredToBeHealthy || 0;
        var c = Ah(a, a.J),
            d = Bh(a, a.J);
        a.hd = a.J;
        a.cd = a.J;
        a.D = null;
        a.Ab = !1;
        setTimeout(function() {
          a.J && a.J.open(c, d);
        }, Math.floor(0));
        b = b.healthyTimeout || 0;
        0 < b && (a.yd = setTimeout(function() {
          a.yd = null;
          a.Ab || (a.J && 102400 < a.J.nb ? (a.f("Connection exceeded healthy timeout but has received " + a.J.nb + " bytes.  Marking connection healthy."), a.Ab = !0, a.J.Ed()) : a.J && 10240 < a.J.ob ? a.f("Connection exceeded healthy timeout but has sent " + a.J.ob + " bytes.  Leaving connection alive.") : (a.f("Closing unhealthy connection after timeout."), a.close()));
        }, Math.floor(b)));
      }
      function Bh(a, b) {
        return function(c) {
          b === a.J ? (a.J = null, c || 0 !== a.Ta ? 1 === a.Ta && a.f("Realtime connection lost.") : (a.f("Realtime connection failed."), "s-" === a.F.Ya.substr(0, 2) && (xc.remove("host:" + a.F.host), a.F.Ya = a.F.host)), a.close()) : b === a.D ? (a.f("Secondary connection lost."), c = a.D, a.D = null, a.hd !== c && a.cd !== c || a.close()) : a.f("closing an old connection");
        };
      }
      function Ah(a, b) {
        return function(c) {
          if (2 != a.Ta)
            if (b === a.cd) {
              var d = Tc("t", c);
              c = Tc("d", c);
              if ("c" == d) {
                if (d = Tc("t", c), "d" in c)
                  if (c = c.d, "h" === d) {
                    var d = c.ts,
                        e = c.v,
                        f = c.h;
                    a.Nf = c.s;
                    Ac(a.F, f);
                    0 == a.Ta && (a.J.start(), Ch(a, a.J, d), "5" !== e && O("Protocol version mismatch detected"), c = a.Pf, (c = 1 < c.gd.length ? c.gd[1] : null) && Dh(a, c));
                  } else if ("n" === d) {
                    a.f("recvd end transmission on primary");
                    a.cd = a.D;
                    for (c = 0; c < a.Md.length; ++c)
                      a.Id(a.Md[c]);
                    a.Md = [];
                    Eh(a);
                  } else
                    "s" === d ? (a.f("Connection shutdown command received. Shutting down..."), a.Ne && (a.Ne(c), a.Ne = null), a.la = null, a.close()) : "r" === d ? (a.f("Reset packet received.  New host: " + c), Ac(a.F, c), 1 === a.Ta ? a.close() : (Fh(a), zh(a))) : "e" === d ? Nc("Server Error: " + c) : "o" === d ? (a.f("got pong on primary."), Gh(a), Hh(a)) : Nc("Unknown control packet command: " + d);
              } else
                "d" == d && a.Id(c);
            } else if (b === a.D)
              if (d = Tc("t", c), c = Tc("d", c), "c" == d)
                "t" in c && (c = c.t, "a" === c ? Ih(a) : "r" === c ? (a.f("Got a reset on secondary, closing it"), a.D.close(), a.hd !== a.D && a.cd !== a.D || a.close()) : "o" === c && (a.f("got pong on secondary."), a.Mf--, Ih(a)));
              else if ("d" == d)
                a.Md.push(c);
              else
                throw Error("Unknown protocol layer: " + d);
            else
              a.f("message on old connection");
        };
      }
      yh.prototype.Fa = function(a) {
        Jh(this, {
          t: "d",
          d: a
        });
      };
      function Eh(a) {
        a.hd === a.D && a.cd === a.D && (a.f("cleaning up and promoting a connection: " + a.D.re), a.J = a.D, a.D = null);
      }
      function Ih(a) {
        0 >= a.Mf ? (a.f("Secondary connection is healthy."), a.Ab = !0, a.D.Ed(), a.D.start(), a.f("sending client ack on secondary"), a.D.send({
          t: "c",
          d: {
            t: "a",
            d: {}
          }
        }), a.f("Ending transmission on primary"), a.J.send({
          t: "c",
          d: {
            t: "n",
            d: {}
          }
        }), a.hd = a.D, Eh(a)) : (a.f("sending ping on secondary."), a.D.send({
          t: "c",
          d: {
            t: "p",
            d: {}
          }
        }));
      }
      yh.prototype.Id = function(a) {
        Gh(this);
        this.jc(a);
      };
      function Gh(a) {
        a.Ab || (a.Re--, 0 >= a.Re && (a.f("Primary connection is healthy."), a.Ab = !0, a.J.Ed()));
      }
      function Dh(a, b) {
        a.D = new b("c:" + a.id + ":" + a.ff++, a.F, a.Nf);
        a.Mf = b.responsesRequiredToBeHealthy || 0;
        a.D.open(Ah(a, a.D), Bh(a, a.D));
        setTimeout(function() {
          a.D && (a.f("Timed out trying to upgrade."), a.D.close());
        }, Math.floor(6E4));
      }
      function Ch(a, b, c) {
        a.f("Realtime connection established.");
        a.J = b;
        a.Ta = 1;
        a.Wc && (a.Wc(c, a.Nf), a.Wc = null);
        0 === a.Re ? (a.f("Primary connection is healthy."), a.Ab = !0) : setTimeout(function() {
          Hh(a);
        }, Math.floor(5E3));
      }
      function Hh(a) {
        a.Ab || 1 !== a.Ta || (a.f("sending ping on primary."), Jh(a, {
          t: "c",
          d: {
            t: "p",
            d: {}
          }
        }));
      }
      function Jh(a, b) {
        if (1 !== a.Ta)
          throw "Connection is not connected";
        a.hd.send(b);
      }
      yh.prototype.close = function() {
        2 !== this.Ta && (this.f("Closing realtime connection."), this.Ta = 2, Fh(this), this.la && (this.la(), this.la = null));
      };
      function Fh(a) {
        a.f("Shutting down all connections");
        a.J && (a.J.close(), a.J = null);
        a.D && (a.D.close(), a.D = null);
        a.yd && (clearTimeout(a.yd), a.yd = null);
      }
      ;
      function Kh(a, b, c, d) {
        this.id = Lh++;
        this.f = Mc("p:" + this.id + ":");
        this.xf = this.Ee = !1;
        this.$ = {};
        this.qa = [];
        this.Yc = 0;
        this.Vc = [];
        this.oa = !1;
        this.Za = 1E3;
        this.Fd = 3E5;
        this.Gb = b;
        this.Uc = c;
        this.Oe = d;
        this.F = a;
        this.sb = this.Aa = this.Ia = this.Bb = this.We = null;
        this.Ob = !1;
        this.Td = {};
        this.Lg = 0;
        this.nf = !0;
        this.Lc = this.Ge = null;
        Mh(this, 0);
        He.ub().Eb("visible", this.Cg, this);
        -1 === a.host.indexOf("fblocal") && Ge.ub().Eb("online", this.Ag, this);
      }
      var Lh = 0,
          Nh = 0;
      g = Kh.prototype;
      g.Fa = function(a, b, c) {
        var d = ++this.Lg;
        a = {
          r: d,
          a: a,
          b: b
        };
        this.f(B(a));
        K(this.oa, "sendRequest call when we're not connected not allowed.");
        this.Ia.Fa(a);
        c && (this.Td[d] = c);
      };
      g.yf = function(a, b, c, d) {
        var e = a.va(),
            f = a.path.toString();
        this.f("Listen called for " + f + " " + e);
        this.$[f] = this.$[f] || {};
        K(fe(a.n) || !S(a.n), "listen() called for non-default but complete query");
        K(!this.$[f][e], "listen() called twice for same path/queryId.");
        a = {
          H: d,
          xd: b,
          Ig: a,
          tag: c
        };
        this.$[f][e] = a;
        this.oa && Oh(this, a);
      };
      function Oh(a, b) {
        var c = b.Ig,
            d = c.path.toString(),
            e = c.va();
        a.f("Listen on " + d + " for " + e);
        var f = {p: d};
        b.tag && (f.q = ee(c.n), f.t = b.tag);
        f.h = b.xd();
        a.Fa("q", f, function(f) {
          var k = f.d,
              l = f.s;
          if (k && "object" === typeof k && v(k, "w")) {
            var m = w(k, "w");
            ea(m) && 0 <= Na(m, "no_index") && O("Using an unspecified index. Consider adding " + ('".indexOn": "' + c.n.g.toString() + '"') + " at " + c.path.toString() + " to your security rules for better performance");
          }
          (a.$[d] && a.$[d][e]) === b && (a.f("listen response", f), "ok" !== l && Ph(a, d, e), b.H && b.H(l, k));
        });
      }
      g.M = function(a, b, c) {
        this.Aa = {
          ig: a,
          of: !1,
          zc: b,
          md: c
        };
        this.f("Authenticating using credential: " + a);
        Qh(this);
        (b = 40 == a.length) || (a = $c(a).Bc, b = "object" === typeof a && !0 === w(a, "admin"));
        b && (this.f("Admin auth credential detected.  Reducing max reconnect time."), this.Fd = 3E4);
      };
      g.ge = function(a) {
        delete this.Aa;
        this.oa && this.Fa("unauth", {}, function(b) {
          a(b.s, b.d);
        });
      };
      function Qh(a) {
        var b = a.Aa;
        a.oa && b && a.Fa("auth", {cred: b.ig}, function(c) {
          var d = c.s;
          c = c.d || "error";
          "ok" !== d && a.Aa === b && delete a.Aa;
          b.of ? "ok" !== d && b.md && b.md(d, c) : (b.of = !0, b.zc && b.zc(d, c));
        });
      }
      g.Rf = function(a, b) {
        var c = a.path.toString(),
            d = a.va();
        this.f("Unlisten called for " + c + " " + d);
        K(fe(a.n) || !S(a.n), "unlisten() called for non-default but complete query");
        if (Ph(this, c, d) && this.oa) {
          var e = ee(a.n);
          this.f("Unlisten on " + c + " for " + d);
          c = {p: c};
          b && (c.q = e, c.t = b);
          this.Fa("n", c);
        }
      };
      g.Me = function(a, b, c) {
        this.oa ? Rh(this, "o", a, b, c) : this.Vc.push({
          $c: a,
          action: "o",
          data: b,
          H: c
        });
      };
      g.Cf = function(a, b, c) {
        this.oa ? Rh(this, "om", a, b, c) : this.Vc.push({
          $c: a,
          action: "om",
          data: b,
          H: c
        });
      };
      g.Jd = function(a, b) {
        this.oa ? Rh(this, "oc", a, null, b) : this.Vc.push({
          $c: a,
          action: "oc",
          data: null,
          H: b
        });
      };
      function Rh(a, b, c, d, e) {
        c = {
          p: c,
          d: d
        };
        a.f("onDisconnect " + b, c);
        a.Fa(b, c, function(a) {
          e && setTimeout(function() {
            e(a.s, a.d);
          }, Math.floor(0));
        });
      }
      g.put = function(a, b, c, d) {
        Sh(this, "p", a, b, c, d);
      };
      g.zf = function(a, b, c, d) {
        Sh(this, "m", a, b, c, d);
      };
      function Sh(a, b, c, d, e, f) {
        d = {
          p: c,
          d: d
        };
        n(f) && (d.h = f);
        a.qa.push({
          action: b,
          Jf: d,
          H: e
        });
        a.Yc++;
        b = a.qa.length - 1;
        a.oa ? Th(a, b) : a.f("Buffering put: " + c);
      }
      function Th(a, b) {
        var c = a.qa[b].action,
            d = a.qa[b].Jf,
            e = a.qa[b].H;
        a.qa[b].Jg = a.oa;
        a.Fa(c, d, function(d) {
          a.f(c + " response", d);
          delete a.qa[b];
          a.Yc--;
          0 === a.Yc && (a.qa = []);
          e && e(d.s, d.d);
        });
      }
      g.Ue = function(a) {
        this.oa && (a = {c: a}, this.f("reportStats", a), this.Fa("s", a, function(a) {
          "ok" !== a.s && this.f("reportStats", "Error sending stats: " + a.d);
        }));
      };
      g.Id = function(a) {
        if ("r" in a) {
          this.f("from server: " + B(a));
          var b = a.r,
              c = this.Td[b];
          c && (delete this.Td[b], c(a.b));
        } else {
          if ("error" in a)
            throw "A server-side error has occurred: " + a.error;
          "a" in a && (b = a.a, c = a.b, this.f("handleServerMessage", b, c), "d" === b ? this.Gb(c.p, c.d, !1, c.t) : "m" === b ? this.Gb(c.p, c.d, !0, c.t) : "c" === b ? Uh(this, c.p, c.q) : "ac" === b ? (a = c.s, b = c.d, c = this.Aa, delete this.Aa, c && c.md && c.md(a, b)) : "sd" === b ? this.We ? this.We(c) : "msg" in c && "undefined" !== typeof console && console.log("FIREBASE: " + c.msg.replace("\n", "\nFIREBASE: ")) : Nc("Unrecognized action received from server: " + B(b) + "\nAre you using the latest client?"));
        }
      };
      g.Wc = function(a, b) {
        this.f("connection ready");
        this.oa = !0;
        this.Lc = (new Date).getTime();
        this.Oe({serverTimeOffset: a - (new Date).getTime()});
        this.Bb = b;
        if (this.nf) {
          var c = {};
          c["sdk.js." + hb.replace(/\./g, "-")] = 1;
          yg() && (c["framework.cordova"] = 1);
          this.Ue(c);
        }
        Vh(this);
        this.nf = !1;
        this.Uc(!0);
      };
      function Mh(a, b) {
        K(!a.Ia, "Scheduling a connect when we're already connected/ing?");
        a.sb && clearTimeout(a.sb);
        a.sb = setTimeout(function() {
          a.sb = null;
          Wh(a);
        }, Math.floor(b));
      }
      g.Cg = function(a) {
        a && !this.Ob && this.Za === this.Fd && (this.f("Window became visible.  Reducing delay."), this.Za = 1E3, this.Ia || Mh(this, 0));
        this.Ob = a;
      };
      g.Ag = function(a) {
        a ? (this.f("Browser went online."), this.Za = 1E3, this.Ia || Mh(this, 0)) : (this.f("Browser went offline.  Killing connection."), this.Ia && this.Ia.close());
      };
      g.Df = function() {
        this.f("data client disconnected");
        this.oa = !1;
        this.Ia = null;
        for (var a = 0; a < this.qa.length; a++) {
          var b = this.qa[a];
          b && "h" in b.Jf && b.Jg && (b.H && b.H("disconnect"), delete this.qa[a], this.Yc--);
        }
        0 === this.Yc && (this.qa = []);
        this.Td = {};
        Xh(this) && (this.Ob ? this.Lc && (3E4 < (new Date).getTime() - this.Lc && (this.Za = 1E3), this.Lc = null) : (this.f("Window isn't visible.  Delaying reconnect."), this.Za = this.Fd, this.Ge = (new Date).getTime()), a = Math.max(0, this.Za - ((new Date).getTime() - this.Ge)), a *= Math.random(), this.f("Trying to reconnect in " + a + "ms"), Mh(this, a), this.Za = Math.min(this.Fd, 1.3 * this.Za));
        this.Uc(!1);
      };
      function Wh(a) {
        if (Xh(a)) {
          a.f("Making a connection attempt");
          a.Ge = (new Date).getTime();
          a.Lc = null;
          var b = q(a.Id, a),
              c = q(a.Wc, a),
              d = q(a.Df, a),
              e = a.id + ":" + Nh++;
          a.Ia = new yh(e, a.F, b, c, d, function(b) {
            O(b + " (" + a.F.toString() + ")");
            a.xf = !0;
          }, a.Bb);
        }
      }
      g.yb = function() {
        this.Ee = !0;
        this.Ia ? this.Ia.close() : (this.sb && (clearTimeout(this.sb), this.sb = null), this.oa && this.Df());
      };
      g.rc = function() {
        this.Ee = !1;
        this.Za = 1E3;
        this.Ia || Mh(this, 0);
      };
      function Uh(a, b, c) {
        c = c ? Qa(c, function(a) {
          return Uc(a);
        }).join("$") : "default";
        (a = Ph(a, b, c)) && a.H && a.H("permission_denied");
      }
      function Ph(a, b, c) {
        b = (new L(b)).toString();
        var d;
        n(a.$[b]) ? (d = a.$[b][c], delete a.$[b][c], 0 === pa(a.$[b]) && delete a.$[b]) : d = void 0;
        return d;
      }
      function Vh(a) {
        Qh(a);
        r(a.$, function(b) {
          r(b, function(b) {
            Oh(a, b);
          });
        });
        for (var b = 0; b < a.qa.length; b++)
          a.qa[b] && Th(a, b);
        for (; a.Vc.length; )
          b = a.Vc.shift(), Rh(a, b.action, b.$c, b.data, b.H);
      }
      function Xh(a) {
        var b;
        b = Ge.ub().kc;
        return !a.xf && !a.Ee && b;
      }
      ;
      var V = {og: function() {
          ih = rh = !0;
        }};
      V.forceLongPolling = V.og;
      V.pg = function() {
        jh = !0;
      };
      V.forceWebSockets = V.pg;
      V.Pg = function(a, b) {
        a.k.Ra.We = b;
      };
      V.setSecurityDebugCallback = V.Pg;
      V.Ye = function(a, b) {
        a.k.Ye(b);
      };
      V.stats = V.Ye;
      V.Ze = function(a, b) {
        a.k.Ze(b);
      };
      V.statsIncrementCounter = V.Ze;
      V.sd = function(a) {
        return a.k.sd;
      };
      V.dataUpdateCount = V.sd;
      V.sg = function(a, b) {
        a.k.De = b;
      };
      V.interceptServerData = V.sg;
      V.yg = function(a) {
        new Ig(a);
      };
      V.onPopupOpen = V.yg;
      V.Ng = function(a) {
        sg = a;
      };
      V.setAuthenticationServer = V.Ng;
      function Q(a, b, c) {
        this.A = a;
        this.W = b;
        this.g = c;
      }
      Q.prototype.I = function() {
        x("Firebase.DataSnapshot.val", 0, 0, arguments.length);
        return this.A.I();
      };
      Q.prototype.val = Q.prototype.I;
      Q.prototype.mf = function() {
        x("Firebase.DataSnapshot.exportVal", 0, 0, arguments.length);
        return this.A.I(!0);
      };
      Q.prototype.exportVal = Q.prototype.mf;
      Q.prototype.ng = function() {
        x("Firebase.DataSnapshot.exists", 0, 0, arguments.length);
        return !this.A.e();
      };
      Q.prototype.exists = Q.prototype.ng;
      Q.prototype.u = function(a) {
        x("Firebase.DataSnapshot.child", 0, 1, arguments.length);
        ga(a) && (a = String(a));
        ig("Firebase.DataSnapshot.child", a);
        var b = new L(a),
            c = this.W.u(b);
        return new Q(this.A.Q(b), c, N);
      };
      Q.prototype.child = Q.prototype.u;
      Q.prototype.Da = function(a) {
        x("Firebase.DataSnapshot.hasChild", 1, 1, arguments.length);
        ig("Firebase.DataSnapshot.hasChild", a);
        var b = new L(a);
        return !this.A.Q(b).e();
      };
      Q.prototype.hasChild = Q.prototype.Da;
      Q.prototype.C = function() {
        x("Firebase.DataSnapshot.getPriority", 0, 0, arguments.length);
        return this.A.C().I();
      };
      Q.prototype.getPriority = Q.prototype.C;
      Q.prototype.forEach = function(a) {
        x("Firebase.DataSnapshot.forEach", 1, 1, arguments.length);
        A("Firebase.DataSnapshot.forEach", 1, a, !1);
        if (this.A.K())
          return !1;
        var b = this;
        return !!this.A.P(this.g, function(c, d) {
          return a(new Q(d, b.W.u(c), N));
        });
      };
      Q.prototype.forEach = Q.prototype.forEach;
      Q.prototype.wd = function() {
        x("Firebase.DataSnapshot.hasChildren", 0, 0, arguments.length);
        return this.A.K() ? !1 : !this.A.e();
      };
      Q.prototype.hasChildren = Q.prototype.wd;
      Q.prototype.name = function() {
        O("Firebase.DataSnapshot.name() being deprecated. Please use Firebase.DataSnapshot.key() instead.");
        x("Firebase.DataSnapshot.name", 0, 0, arguments.length);
        return this.key();
      };
      Q.prototype.name = Q.prototype.name;
      Q.prototype.key = function() {
        x("Firebase.DataSnapshot.key", 0, 0, arguments.length);
        return this.W.key();
      };
      Q.prototype.key = Q.prototype.key;
      Q.prototype.Db = function() {
        x("Firebase.DataSnapshot.numChildren", 0, 0, arguments.length);
        return this.A.Db();
      };
      Q.prototype.numChildren = Q.prototype.Db;
      Q.prototype.Ib = function() {
        x("Firebase.DataSnapshot.ref", 0, 0, arguments.length);
        return this.W;
      };
      Q.prototype.ref = Q.prototype.Ib;
      function Yh(a, b) {
        this.F = a;
        this.Ua = Rb(a);
        this.fd = null;
        this.da = new vb;
        this.Hd = 1;
        this.Ra = null;
        b || 0 <= ("object" === typeof window && window.navigator && window.navigator.userAgent || "").search(/googlebot|google webmaster tools|bingbot|yahoo! slurp|baiduspider|yandexbot|duckduckbot/i) ? (this.ba = new Ae(this.F, q(this.Gb, this)), setTimeout(q(this.Uc, this, !0), 0)) : this.ba = this.Ra = new Kh(this.F, q(this.Gb, this), q(this.Uc, this), q(this.Oe, this));
        this.Sg = Sb(a, q(function() {
          return new Mb(this.Ua, this.ba);
        }, this));
        this.uc = new Rf;
        this.Ce = new ob;
        var c = this;
        this.Cd = new vf({
          Xe: function(a, b, f, h) {
            b = [];
            f = c.Ce.j(a.path);
            f.e() || (b = xf(c.Cd, new Xb(bf, a.path, f)), setTimeout(function() {
              h("ok");
            }, 0));
            return b;
          },
          ae: ba
        });
        Zh(this, "connected", !1);
        this.la = new qc;
        this.M = new Sg(a, q(this.ba.M, this.ba), q(this.ba.ge, this.ba), q(this.Le, this));
        this.sd = 0;
        this.De = null;
        this.L = new vf({
          Xe: function(a, b, f, h) {
            c.ba.yf(a, f, b, function(b, e) {
              var f = h(b, e);
              Ab(c.da, a.path, f);
            });
            return [];
          },
          ae: function(a, b) {
            c.ba.Rf(a, b);
          }
        });
      }
      g = Yh.prototype;
      g.toString = function() {
        return (this.F.kb ? "https://" : "http://") + this.F.host;
      };
      g.name = function() {
        return this.F.hc;
      };
      function $h(a) {
        a = a.Ce.j(new L(".info/serverTimeOffset")).I() || 0;
        return (new Date).getTime() + a;
      }
      function ai(a) {
        a = a = {timestamp: $h(a)};
        a.timestamp = a.timestamp || (new Date).getTime();
        return a;
      }
      g.Gb = function(a, b, c, d) {
        this.sd++;
        var e = new L(a);
        b = this.De ? this.De(a, b) : b;
        a = [];
        d ? c ? (b = na(b, function(a) {
          return M(a);
        }), a = Ff(this.L, e, b, d)) : (b = M(b), a = Bf(this.L, e, b, d)) : c ? (d = na(b, function(a) {
          return M(a);
        }), a = Af(this.L, e, d)) : (d = M(b), a = xf(this.L, new Xb(bf, e, d)));
        d = e;
        0 < a.length && (d = bi(this, e));
        Ab(this.da, d, a);
      };
      g.Uc = function(a) {
        Zh(this, "connected", a);
        !1 === a && ci(this);
      };
      g.Oe = function(a) {
        var b = this;
        Wc(a, function(a, d) {
          Zh(b, d, a);
        });
      };
      g.Le = function(a) {
        Zh(this, "authenticated", a);
      };
      function Zh(a, b, c) {
        b = new L("/.info/" + b);
        c = M(c);
        var d = a.Ce;
        d.Wd = d.Wd.G(b, c);
        c = xf(a.Cd, new Xb(bf, b, c));
        Ab(a.da, b, c);
      }
      g.Kb = function(a, b, c, d) {
        this.f("set", {
          path: a.toString(),
          value: b,
          $g: c
        });
        var e = ai(this);
        b = M(b, c);
        var e = sc(b, e),
            f = this.Hd++,
            e = wf(this.L, a, e, f, !0);
        wb(this.da, e);
        var h = this;
        this.ba.put(a.toString(), b.I(!0), function(b, c) {
          var e = "ok" === b;
          e || O("set at " + a + " failed: " + b);
          e = zf(h.L, f, !e);
          Ab(h.da, a, e);
          di(d, b, c);
        });
        e = ei(this, a);
        bi(this, e);
        Ab(this.da, e, []);
      };
      g.update = function(a, b, c) {
        this.f("update", {
          path: a.toString(),
          value: b
        });
        var d = !0,
            e = ai(this),
            f = {};
        r(b, function(a, b) {
          d = !1;
          var c = M(a);
          f[b] = sc(c, e);
        });
        if (d)
          Cb("update() called with empty data.  Don't do anything."), di(c, "ok");
        else {
          var h = this.Hd++,
              k = yf(this.L, a, f, h);
          wb(this.da, k);
          var l = this;
          this.ba.zf(a.toString(), b, function(b, d) {
            var e = "ok" === b;
            e || O("update at " + a + " failed: " + b);
            var e = zf(l.L, h, !e),
                f = a;
            0 < e.length && (f = bi(l, a));
            Ab(l.da, f, e);
            di(c, b, d);
          });
          b = ei(this, a);
          bi(this, b);
          Ab(this.da, a, []);
        }
      };
      function ci(a) {
        a.f("onDisconnectEvents");
        var b = ai(a),
            c = [];
        rc(pc(a.la, b), G, function(b, e) {
          c = c.concat(xf(a.L, new Xb(bf, b, e)));
          var f = ei(a, b);
          bi(a, f);
        });
        a.la = new qc;
        Ab(a.da, G, c);
      }
      g.Jd = function(a, b) {
        var c = this;
        this.ba.Jd(a.toString(), function(d, e) {
          "ok" === d && rg(c.la, a);
          di(b, d, e);
        });
      };
      function fi(a, b, c, d) {
        var e = M(c);
        a.ba.Me(b.toString(), e.I(!0), function(c, h) {
          "ok" === c && a.la.nc(b, e);
          di(d, c, h);
        });
      }
      function gi(a, b, c, d, e) {
        var f = M(c, d);
        a.ba.Me(b.toString(), f.I(!0), function(c, d) {
          "ok" === c && a.la.nc(b, f);
          di(e, c, d);
        });
      }
      function hi(a, b, c, d) {
        var e = !0,
            f;
        for (f in c)
          e = !1;
        e ? (Cb("onDisconnect().update() called with empty data.  Don't do anything."), di(d, "ok")) : a.ba.Cf(b.toString(), c, function(e, f) {
          if ("ok" === e)
            for (var l in c) {
              var m = M(c[l]);
              a.la.nc(b.u(l), m);
            }
          di(d, e, f);
        });
      }
      function ii(a, b, c) {
        c = ".info" === E(b.path) ? a.Cd.Pb(b, c) : a.L.Pb(b, c);
        yb(a.da, b.path, c);
      }
      g.yb = function() {
        this.Ra && this.Ra.yb();
      };
      g.rc = function() {
        this.Ra && this.Ra.rc();
      };
      g.Ye = function(a) {
        if ("undefined" !== typeof console) {
          a ? (this.fd || (this.fd = new Lb(this.Ua)), a = this.fd.get()) : a = this.Ua.get();
          var b = Ra(sa(a), function(a, b) {
            return Math.max(b.length, a);
          }, 0),
              c;
          for (c in a) {
            for (var d = a[c],
                e = c.length; e < b + 2; e++)
              c += " ";
            console.log(c + d);
          }
        }
      };
      g.Ze = function(a) {
        Ob(this.Ua, a);
        this.Sg.Of[a] = !0;
      };
      g.f = function(a) {
        var b = "";
        this.Ra && (b = this.Ra.id + ":");
        Cb(b, arguments);
      };
      function di(a, b, c) {
        a && Db(function() {
          if ("ok" == b)
            a(null);
          else {
            var d = (b || "error").toUpperCase(),
                e = d;
            c && (e += ": " + c);
            e = Error(e);
            e.code = d;
            a(e);
          }
        });
      }
      ;
      function ji(a, b, c, d, e) {
        function f() {}
        a.f("transaction on " + b);
        var h = new U(a, b);
        h.Eb("value", f);
        c = {
          path: b,
          update: c,
          H: d,
          status: null,
          Ff: Ec(),
          cf: e,
          Lf: 0,
          ie: function() {
            h.ic("value", f);
          },
          ke: null,
          Ba: null,
          pd: null,
          qd: null,
          rd: null
        };
        d = a.L.za(b, void 0) || C;
        c.pd = d;
        d = c.update(d.I());
        if (n(d)) {
          cg("transaction failed: Data returned ", d, c.path);
          c.status = 1;
          e = Sf(a.uc, b);
          var k = e.Ca() || [];
          k.push(c);
          Tf(e, k);
          "object" === typeof d && null !== d && v(d, ".priority") ? (k = w(d, ".priority"), K(ag(k), "Invalid priority returned by transaction. Priority must be a valid string, finite number, server value, or null.")) : k = (a.L.za(b) || C).C().I();
          e = ai(a);
          d = M(d, k);
          e = sc(d, e);
          c.qd = d;
          c.rd = e;
          c.Ba = a.Hd++;
          c = wf(a.L, b, e, c.Ba, c.cf);
          Ab(a.da, b, c);
          ki(a);
        } else
          c.ie(), c.qd = null, c.rd = null, c.H && (a = new Q(c.pd, new U(a, c.path), N), c.H(null, !1, a));
      }
      function ki(a, b) {
        var c = b || a.uc;
        b || li(a, c);
        if (null !== c.Ca()) {
          var d = mi(a, c);
          K(0 < d.length, "Sending zero length transaction queue");
          Sa(d, function(a) {
            return 1 === a.status;
          }) && ni(a, c.path(), d);
        } else
          c.wd() && c.P(function(b) {
            ki(a, b);
          });
      }
      function ni(a, b, c) {
        for (var d = Qa(c, function(a) {
          return a.Ba;
        }),
            e = a.L.za(b, d) || C,
            d = e,
            e = e.hash(),
            f = 0; f < c.length; f++) {
          var h = c[f];
          K(1 === h.status, "tryToSendTransactionQueue_: items in queue should all be run.");
          h.status = 2;
          h.Lf++;
          var k = T(b, h.path),
              d = d.G(k, h.qd);
        }
        d = d.I(!0);
        a.ba.put(b.toString(), d, function(d) {
          a.f("transaction put response", {
            path: b.toString(),
            status: d
          });
          var e = [];
          if ("ok" === d) {
            d = [];
            for (f = 0; f < c.length; f++) {
              c[f].status = 3;
              e = e.concat(zf(a.L, c[f].Ba));
              if (c[f].H) {
                var h = c[f].rd,
                    k = new U(a, c[f].path);
                d.push(q(c[f].H, null, null, !0, new Q(h, k, N)));
              }
              c[f].ie();
            }
            li(a, Sf(a.uc, b));
            ki(a);
            Ab(a.da, b, e);
            for (f = 0; f < d.length; f++)
              Db(d[f]);
          } else {
            if ("datastale" === d)
              for (f = 0; f < c.length; f++)
                c[f].status = 4 === c[f].status ? 5 : 1;
            else
              for (O("transaction at " + b.toString() + " failed: " + d), f = 0; f < c.length; f++)
                c[f].status = 5, c[f].ke = d;
            bi(a, b);
          }
        }, e);
      }
      function bi(a, b) {
        var c = oi(a, b),
            d = c.path(),
            c = mi(a, c);
        pi(a, c, d);
        return d;
      }
      function pi(a, b, c) {
        if (0 !== b.length) {
          for (var d = [],
              e = [],
              f = Qa(b, function(a) {
                return a.Ba;
              }),
              h = 0; h < b.length; h++) {
            var k = b[h],
                l = T(c, k.path),
                m = !1,
                t;
            K(null !== l, "rerunTransactionsUnderNode_: relativePath should not be null.");
            if (5 === k.status)
              m = !0, t = k.ke, e = e.concat(zf(a.L, k.Ba, !0));
            else if (1 === k.status)
              if (25 <= k.Lf)
                m = !0, t = "maxretry", e = e.concat(zf(a.L, k.Ba, !0));
              else {
                var z = a.L.za(k.path, f) || C;
                k.pd = z;
                var I = b[h].update(z.I());
                n(I) ? (cg("transaction failed: Data returned ", I, k.path), l = M(I), "object" === typeof I && null != I && v(I, ".priority") || (l = l.ga(z.C())), z = k.Ba, I = ai(a), I = sc(l, I), k.qd = l, k.rd = I, k.Ba = a.Hd++, Va(f, z), e = e.concat(wf(a.L, k.path, I, k.Ba, k.cf)), e = e.concat(zf(a.L, z, !0))) : (m = !0, t = "nodata", e = e.concat(zf(a.L, k.Ba, !0)));
              }
            Ab(a.da, c, e);
            e = [];
            m && (b[h].status = 3, setTimeout(b[h].ie, Math.floor(0)), b[h].H && ("nodata" === t ? (k = new U(a, b[h].path), d.push(q(b[h].H, null, null, !1, new Q(b[h].pd, k, N)))) : d.push(q(b[h].H, null, Error(t), !1, null))));
          }
          li(a, a.uc);
          for (h = 0; h < d.length; h++)
            Db(d[h]);
          ki(a);
        }
      }
      function oi(a, b) {
        for (var c,
            d = a.uc; null !== (c = E(b)) && null === d.Ca(); )
          d = Sf(d, c), b = H(b);
        return d;
      }
      function mi(a, b) {
        var c = [];
        qi(a, b, c);
        c.sort(function(a, b) {
          return a.Ff - b.Ff;
        });
        return c;
      }
      function qi(a, b, c) {
        var d = b.Ca();
        if (null !== d)
          for (var e = 0; e < d.length; e++)
            c.push(d[e]);
        b.P(function(b) {
          qi(a, b, c);
        });
      }
      function li(a, b) {
        var c = b.Ca();
        if (c) {
          for (var d = 0,
              e = 0; e < c.length; e++)
            3 !== c[e].status && (c[d] = c[e], d++);
          c.length = d;
          Tf(b, 0 < c.length ? c : null);
        }
        b.P(function(b) {
          li(a, b);
        });
      }
      function ei(a, b) {
        var c = oi(a, b).path(),
            d = Sf(a.uc, b);
        Wf(d, function(b) {
          ri(a, b);
        });
        ri(a, d);
        Vf(d, function(b) {
          ri(a, b);
        });
        return c;
      }
      function ri(a, b) {
        var c = b.Ca();
        if (null !== c) {
          for (var d = [],
              e = [],
              f = -1,
              h = 0; h < c.length; h++)
            4 !== c[h].status && (2 === c[h].status ? (K(f === h - 1, "All SENT items should be at beginning of queue."), f = h, c[h].status = 4, c[h].ke = "set") : (K(1 === c[h].status, "Unexpected transaction status in abort"), c[h].ie(), e = e.concat(zf(a.L, c[h].Ba, !0)), c[h].H && d.push(q(c[h].H, null, Error("set"), !1, null))));
          -1 === f ? Tf(b, null) : c.length = f + 1;
          Ab(a.da, b.path(), e);
          for (h = 0; h < d.length; h++)
            Db(d[h]);
        }
      }
      ;
      function W() {
        this.oc = {};
        this.Sf = !1;
      }
      W.prototype.yb = function() {
        for (var a in this.oc)
          this.oc[a].yb();
      };
      W.prototype.rc = function() {
        for (var a in this.oc)
          this.oc[a].rc();
      };
      W.prototype.ve = function() {
        this.Sf = !0;
      };
      ca(W);
      W.prototype.interrupt = W.prototype.yb;
      W.prototype.resume = W.prototype.rc;
      function X(a, b) {
        this.bd = a;
        this.ra = b;
      }
      X.prototype.cancel = function(a) {
        x("Firebase.onDisconnect().cancel", 0, 1, arguments.length);
        A("Firebase.onDisconnect().cancel", 1, a, !0);
        this.bd.Jd(this.ra, a || null);
      };
      X.prototype.cancel = X.prototype.cancel;
      X.prototype.remove = function(a) {
        x("Firebase.onDisconnect().remove", 0, 1, arguments.length);
        jg("Firebase.onDisconnect().remove", this.ra);
        A("Firebase.onDisconnect().remove", 1, a, !0);
        fi(this.bd, this.ra, null, a);
      };
      X.prototype.remove = X.prototype.remove;
      X.prototype.set = function(a, b) {
        x("Firebase.onDisconnect().set", 1, 2, arguments.length);
        jg("Firebase.onDisconnect().set", this.ra);
        bg("Firebase.onDisconnect().set", a, this.ra, !1);
        A("Firebase.onDisconnect().set", 2, b, !0);
        fi(this.bd, this.ra, a, b);
      };
      X.prototype.set = X.prototype.set;
      X.prototype.Kb = function(a, b, c) {
        x("Firebase.onDisconnect().setWithPriority", 2, 3, arguments.length);
        jg("Firebase.onDisconnect().setWithPriority", this.ra);
        bg("Firebase.onDisconnect().setWithPriority", a, this.ra, !1);
        fg("Firebase.onDisconnect().setWithPriority", 2, b);
        A("Firebase.onDisconnect().setWithPriority", 3, c, !0);
        gi(this.bd, this.ra, a, b, c);
      };
      X.prototype.setWithPriority = X.prototype.Kb;
      X.prototype.update = function(a, b) {
        x("Firebase.onDisconnect().update", 1, 2, arguments.length);
        jg("Firebase.onDisconnect().update", this.ra);
        if (ea(a)) {
          for (var c = {},
              d = 0; d < a.length; ++d)
            c["" + d] = a[d];
          a = c;
          O("Passing an Array to Firebase.onDisconnect().update() is deprecated. Use set() if you want to overwrite the existing data, or an Object with integer keys if you really do want to only update some of the children.");
        }
        eg("Firebase.onDisconnect().update", a, this.ra);
        A("Firebase.onDisconnect().update", 2, b, !0);
        hi(this.bd, this.ra, a, b);
      };
      X.prototype.update = X.prototype.update;
      function Y(a, b, c, d) {
        this.k = a;
        this.path = b;
        this.n = c;
        this.lc = d;
      }
      function si(a) {
        var b = null,
            c = null;
        a.ma && (b = nd(a));
        a.pa && (c = pd(a));
        if (a.g === Qd) {
          if (a.ma) {
            if ("[MIN_NAME]" != md(a))
              throw Error("Query: When ordering by key, you may only pass one argument to startAt(), endAt(), or equalTo().");
            if ("string" !== typeof b)
              throw Error("Query: When ordering by key, the argument passed to startAt(), endAt(),or equalTo() must be a string.");
          }
          if (a.pa) {
            if ("[MAX_NAME]" != od(a))
              throw Error("Query: When ordering by key, you may only pass one argument to startAt(), endAt(), or equalTo().");
            if ("string" !== typeof c)
              throw Error("Query: When ordering by key, the argument passed to startAt(), endAt(),or equalTo() must be a string.");
          }
        } else if (a.g === N) {
          if (null != b && !ag(b) || null != c && !ag(c))
            throw Error("Query: When ordering by priority, the first argument passed to startAt(), endAt(), or equalTo() must be a valid priority value (null, a number, or a string).");
        } else if (K(a.g instanceof Ud || a.g === $d, "unknown index type."), null != b && "object" === typeof b || null != c && "object" === typeof c)
          throw Error("Query: First argument passed to startAt(), endAt(), or equalTo() cannot be an object.");
      }
      function ti(a) {
        if (a.ma && a.pa && a.ja && (!a.ja || "" === a.Nb))
          throw Error("Query: Can't combine startAt(), endAt(), and limit(). Use limitToFirst() or limitToLast() instead.");
      }
      function ui(a, b) {
        if (!0 === a.lc)
          throw Error(b + ": You can't combine multiple orderBy calls.");
      }
      g = Y.prototype;
      g.Ib = function() {
        x("Query.ref", 0, 0, arguments.length);
        return new U(this.k, this.path);
      };
      g.Eb = function(a, b, c, d) {
        x("Query.on", 2, 4, arguments.length);
        gg("Query.on", a, !1);
        A("Query.on", 2, b, !1);
        var e = vi("Query.on", c, d);
        if ("value" === a)
          ii(this.k, this, new id(b, e.cancel || null, e.Ma || null));
        else {
          var f = {};
          f[a] = b;
          ii(this.k, this, new jd(f, e.cancel, e.Ma));
        }
        return b;
      };
      g.ic = function(a, b, c) {
        x("Query.off", 0, 3, arguments.length);
        gg("Query.off", a, !0);
        A("Query.off", 2, b, !0);
        mb("Query.off", 3, c);
        var d = null,
            e = null;
        "value" === a ? d = new id(b || null, null, c || null) : a && (b && (e = {}, e[a] = b), d = new jd(e, null, c || null));
        e = this.k;
        d = ".info" === E(this.path) ? e.Cd.jb(this, d) : e.L.jb(this, d);
        yb(e.da, this.path, d);
      };
      g.Dg = function(a, b) {
        function c(h) {
          f && (f = !1, e.ic(a, c), b.call(d.Ma, h));
        }
        x("Query.once", 2, 4, arguments.length);
        gg("Query.once", a, !1);
        A("Query.once", 2, b, !1);
        var d = vi("Query.once", arguments[2], arguments[3]),
            e = this,
            f = !0;
        this.Eb(a, c, function(b) {
          e.ic(a, c);
          d.cancel && d.cancel.call(d.Ma, b);
        });
      };
      g.He = function(a) {
        O("Query.limit() being deprecated. Please use Query.limitToFirst() or Query.limitToLast() instead.");
        x("Query.limit", 1, 1, arguments.length);
        if (!ga(a) || Math.floor(a) !== a || 0 >= a)
          throw Error("Query.limit: First argument must be a positive integer.");
        if (this.n.ja)
          throw Error("Query.limit: Limit was already set (by another call to limit, limitToFirst, orlimitToLast.");
        var b = this.n.He(a);
        ti(b);
        return new Y(this.k, this.path, b, this.lc);
      };
      g.Ie = function(a) {
        x("Query.limitToFirst", 1, 1, arguments.length);
        if (!ga(a) || Math.floor(a) !== a || 0 >= a)
          throw Error("Query.limitToFirst: First argument must be a positive integer.");
        if (this.n.ja)
          throw Error("Query.limitToFirst: Limit was already set (by another call to limit, limitToFirst, or limitToLast).");
        return new Y(this.k, this.path, this.n.Ie(a), this.lc);
      };
      g.Je = function(a) {
        x("Query.limitToLast", 1, 1, arguments.length);
        if (!ga(a) || Math.floor(a) !== a || 0 >= a)
          throw Error("Query.limitToLast: First argument must be a positive integer.");
        if (this.n.ja)
          throw Error("Query.limitToLast: Limit was already set (by another call to limit, limitToFirst, or limitToLast).");
        return new Y(this.k, this.path, this.n.Je(a), this.lc);
      };
      g.Eg = function(a) {
        x("Query.orderByChild", 1, 1, arguments.length);
        if ("$key" === a)
          throw Error('Query.orderByChild: "$key" is invalid.  Use Query.orderByKey() instead.');
        if ("$priority" === a)
          throw Error('Query.orderByChild: "$priority" is invalid.  Use Query.orderByPriority() instead.');
        if ("$value" === a)
          throw Error('Query.orderByChild: "$value" is invalid.  Use Query.orderByValue() instead.');
        ig("Query.orderByChild", a);
        ui(this, "Query.orderByChild");
        var b = new L(a);
        if (b.e())
          throw Error("Query.orderByChild: cannot pass in empty path.  Use Query.orderByValue() instead.");
        b = new Ud(b);
        b = de(this.n, b);
        si(b);
        return new Y(this.k, this.path, b, !0);
      };
      g.Fg = function() {
        x("Query.orderByKey", 0, 0, arguments.length);
        ui(this, "Query.orderByKey");
        var a = de(this.n, Qd);
        si(a);
        return new Y(this.k, this.path, a, !0);
      };
      g.Gg = function() {
        x("Query.orderByPriority", 0, 0, arguments.length);
        ui(this, "Query.orderByPriority");
        var a = de(this.n, N);
        si(a);
        return new Y(this.k, this.path, a, !0);
      };
      g.Hg = function() {
        x("Query.orderByValue", 0, 0, arguments.length);
        ui(this, "Query.orderByValue");
        var a = de(this.n, $d);
        si(a);
        return new Y(this.k, this.path, a, !0);
      };
      g.$d = function(a, b) {
        x("Query.startAt", 0, 2, arguments.length);
        bg("Query.startAt", a, this.path, !0);
        hg("Query.startAt", b);
        var c = this.n.$d(a, b);
        ti(c);
        si(c);
        if (this.n.ma)
          throw Error("Query.startAt: Starting point was already set (by another call to startAt or equalTo).");
        n(a) || (b = a = null);
        return new Y(this.k, this.path, c, this.lc);
      };
      g.td = function(a, b) {
        x("Query.endAt", 0, 2, arguments.length);
        bg("Query.endAt", a, this.path, !0);
        hg("Query.endAt", b);
        var c = this.n.td(a, b);
        ti(c);
        si(c);
        if (this.n.pa)
          throw Error("Query.endAt: Ending point was already set (by another call to endAt or equalTo).");
        return new Y(this.k, this.path, c, this.lc);
      };
      g.kg = function(a, b) {
        x("Query.equalTo", 1, 2, arguments.length);
        bg("Query.equalTo", a, this.path, !1);
        hg("Query.equalTo", b);
        if (this.n.ma)
          throw Error("Query.equalTo: Starting point was already set (by another call to endAt or equalTo).");
        if (this.n.pa)
          throw Error("Query.equalTo: Ending point was already set (by another call to endAt or equalTo).");
        return this.$d(a, b).td(a, b);
      };
      g.toString = function() {
        x("Query.toString", 0, 0, arguments.length);
        for (var a = this.path,
            b = "",
            c = a.Z; c < a.o.length; c++)
          "" !== a.o[c] && (b += "/" + encodeURIComponent(String(a.o[c])));
        return this.k.toString() + (b || "/");
      };
      g.va = function() {
        var a = Uc(ee(this.n));
        return "{}" === a ? "default" : a;
      };
      function vi(a, b, c) {
        var d = {
          cancel: null,
          Ma: null
        };
        if (b && c)
          d.cancel = b, A(a, 3, d.cancel, !0), d.Ma = c, mb(a, 4, d.Ma);
        else if (b)
          if ("object" === typeof b && null !== b)
            d.Ma = b;
          else if ("function" === typeof b)
            d.cancel = b;
          else
            throw Error(y(a, 3, !0) + " must either be a cancel callback or a context object.");
        return d;
      }
      Y.prototype.ref = Y.prototype.Ib;
      Y.prototype.on = Y.prototype.Eb;
      Y.prototype.off = Y.prototype.ic;
      Y.prototype.once = Y.prototype.Dg;
      Y.prototype.limit = Y.prototype.He;
      Y.prototype.limitToFirst = Y.prototype.Ie;
      Y.prototype.limitToLast = Y.prototype.Je;
      Y.prototype.orderByChild = Y.prototype.Eg;
      Y.prototype.orderByKey = Y.prototype.Fg;
      Y.prototype.orderByPriority = Y.prototype.Gg;
      Y.prototype.orderByValue = Y.prototype.Hg;
      Y.prototype.startAt = Y.prototype.$d;
      Y.prototype.endAt = Y.prototype.td;
      Y.prototype.equalTo = Y.prototype.kg;
      Y.prototype.toString = Y.prototype.toString;
      var Z = {};
      Z.vc = Kh;
      Z.DataConnection = Z.vc;
      Kh.prototype.Rg = function(a, b) {
        this.Fa("q", {p: a}, b);
      };
      Z.vc.prototype.simpleListen = Z.vc.prototype.Rg;
      Kh.prototype.jg = function(a, b) {
        this.Fa("echo", {d: a}, b);
      };
      Z.vc.prototype.echo = Z.vc.prototype.jg;
      Kh.prototype.interrupt = Kh.prototype.yb;
      Z.Vf = yh;
      Z.RealTimeConnection = Z.Vf;
      yh.prototype.sendRequest = yh.prototype.Fa;
      yh.prototype.close = yh.prototype.close;
      Z.rg = function(a) {
        var b = Kh.prototype.put;
        Kh.prototype.put = function(c, d, e, f) {
          n(f) && (f = a());
          b.call(this, c, d, e, f);
        };
        return function() {
          Kh.prototype.put = b;
        };
      };
      Z.hijackHash = Z.rg;
      Z.Uf = zc;
      Z.ConnectionTarget = Z.Uf;
      Z.va = function(a) {
        return a.va();
      };
      Z.queryIdentifier = Z.va;
      Z.tg = function(a) {
        return a.k.Ra.$;
      };
      Z.listens = Z.tg;
      Z.ve = function(a) {
        a.ve();
      };
      Z.forceRestClient = Z.ve;
      function U(a, b) {
        var c,
            d,
            e;
        if (a instanceof Yh)
          c = a, d = b;
        else {
          x("new Firebase", 1, 2, arguments.length);
          d = Pc(arguments[0]);
          c = d.Tg;
          "firebase" === d.domain && Oc(d.host + " is no longer supported. Please use <YOUR FIREBASE>.firebaseio.com instead");
          c && "undefined" != c || Oc("Cannot parse Firebase url. Please use https://<YOUR FIREBASE>.firebaseio.com");
          d.kb || "undefined" !== typeof window && window.location && window.location.protocol && -1 !== window.location.protocol.indexOf("https:") && O("Insecure Firebase access from a secure page. Please use https in calls to new Firebase().");
          c = new zc(d.host, d.kb, c, "ws" === d.scheme || "wss" === d.scheme);
          d = new L(d.$c);
          e = d.toString();
          var f;
          !(f = !p(c.host) || 0 === c.host.length || !$f(c.hc)) && (f = 0 !== e.length) && (e && (e = e.replace(/^\/*\.info(\/|$)/, "/")), f = !(p(e) && 0 !== e.length && !Yf.test(e)));
          if (f)
            throw Error(y("new Firebase", 1, !1) + 'must be a valid firebase URL and the path can\'t contain ".", "#", "$", "[", or "]".');
          if (b)
            if (b instanceof W)
              e = b;
            else if (p(b))
              e = W.ub(), c.Od = b;
            else
              throw Error("Expected a valid Firebase.Context for second argument to new Firebase()");
          else
            e = W.ub();
          f = c.toString();
          var h = w(e.oc, f);
          h || (h = new Yh(c, e.Sf), e.oc[f] = h);
          c = h;
        }
        Y.call(this, c, d, be, !1);
      }
      ma(U, Y);
      var wi = U,
          xi = ["Firebase"],
          yi = aa;
      xi[0] in yi || !yi.execScript || yi.execScript("var " + xi[0]);
      for (var zi; xi.length && (zi = xi.shift()); )
        !xi.length && n(wi) ? yi[zi] = wi : yi = yi[zi] ? yi[zi] : yi[zi] = {};
      U.goOffline = function() {
        x("Firebase.goOffline", 0, 0, arguments.length);
        W.ub().yb();
      };
      U.goOnline = function() {
        x("Firebase.goOnline", 0, 0, arguments.length);
        W.ub().rc();
      };
      function Lc(a, b) {
        K(!b || !0 === a || !1 === a, "Can't turn on custom loggers persistently.");
        !0 === a ? ("undefined" !== typeof console && ("function" === typeof console.log ? Bb = q(console.log, console) : "object" === typeof console.log && (Bb = function(a) {
          console.log(a);
        })), b && yc.set("logging_enabled", !0)) : a ? Bb = a : (Bb = null, yc.remove("logging_enabled"));
      }
      U.enableLogging = Lc;
      U.ServerValue = {TIMESTAMP: {".sv": "timestamp"}};
      U.SDK_VERSION = hb;
      U.INTERNAL = V;
      U.Context = W;
      U.TEST_ACCESS = Z;
      U.prototype.name = function() {
        O("Firebase.name() being deprecated. Please use Firebase.key() instead.");
        x("Firebase.name", 0, 0, arguments.length);
        return this.key();
      };
      U.prototype.name = U.prototype.name;
      U.prototype.key = function() {
        x("Firebase.key", 0, 0, arguments.length);
        return this.path.e() ? null : Ld(this.path);
      };
      U.prototype.key = U.prototype.key;
      U.prototype.u = function(a) {
        x("Firebase.child", 1, 1, arguments.length);
        if (ga(a))
          a = String(a);
        else if (!(a instanceof L))
          if (null === E(this.path)) {
            var b = a;
            b && (b = b.replace(/^\/*\.info(\/|$)/, "/"));
            ig("Firebase.child", b);
          } else
            ig("Firebase.child", a);
        return new U(this.k, this.path.u(a));
      };
      U.prototype.child = U.prototype.u;
      U.prototype.parent = function() {
        x("Firebase.parent", 0, 0, arguments.length);
        var a = this.path.parent();
        return null === a ? null : new U(this.k, a);
      };
      U.prototype.parent = U.prototype.parent;
      U.prototype.root = function() {
        x("Firebase.ref", 0, 0, arguments.length);
        for (var a = this; null !== a.parent(); )
          a = a.parent();
        return a;
      };
      U.prototype.root = U.prototype.root;
      U.prototype.set = function(a, b) {
        x("Firebase.set", 1, 2, arguments.length);
        jg("Firebase.set", this.path);
        bg("Firebase.set", a, this.path, !1);
        A("Firebase.set", 2, b, !0);
        this.k.Kb(this.path, a, null, b || null);
      };
      U.prototype.set = U.prototype.set;
      U.prototype.update = function(a, b) {
        x("Firebase.update", 1, 2, arguments.length);
        jg("Firebase.update", this.path);
        if (ea(a)) {
          for (var c = {},
              d = 0; d < a.length; ++d)
            c["" + d] = a[d];
          a = c;
          O("Passing an Array to Firebase.update() is deprecated. Use set() if you want to overwrite the existing data, or an Object with integer keys if you really do want to only update some of the children.");
        }
        eg("Firebase.update", a, this.path);
        A("Firebase.update", 2, b, !0);
        this.k.update(this.path, a, b || null);
      };
      U.prototype.update = U.prototype.update;
      U.prototype.Kb = function(a, b, c) {
        x("Firebase.setWithPriority", 2, 3, arguments.length);
        jg("Firebase.setWithPriority", this.path);
        bg("Firebase.setWithPriority", a, this.path, !1);
        fg("Firebase.setWithPriority", 2, b);
        A("Firebase.setWithPriority", 3, c, !0);
        if (".length" === this.key() || ".keys" === this.key())
          throw "Firebase.setWithPriority failed: " + this.key() + " is a read-only object.";
        this.k.Kb(this.path, a, b, c || null);
      };
      U.prototype.setWithPriority = U.prototype.Kb;
      U.prototype.remove = function(a) {
        x("Firebase.remove", 0, 1, arguments.length);
        jg("Firebase.remove", this.path);
        A("Firebase.remove", 1, a, !0);
        this.set(null, a);
      };
      U.prototype.remove = U.prototype.remove;
      U.prototype.transaction = function(a, b, c) {
        x("Firebase.transaction", 1, 3, arguments.length);
        jg("Firebase.transaction", this.path);
        A("Firebase.transaction", 1, a, !1);
        A("Firebase.transaction", 2, b, !0);
        if (n(c) && "boolean" != typeof c)
          throw Error(y("Firebase.transaction", 3, !0) + "must be a boolean.");
        if (".length" === this.key() || ".keys" === this.key())
          throw "Firebase.transaction failed: " + this.key() + " is a read-only object.";
        "undefined" === typeof c && (c = !0);
        ji(this.k, this.path, a, b || null, c);
      };
      U.prototype.transaction = U.prototype.transaction;
      U.prototype.Og = function(a, b) {
        x("Firebase.setPriority", 1, 2, arguments.length);
        jg("Firebase.setPriority", this.path);
        fg("Firebase.setPriority", 1, a);
        A("Firebase.setPriority", 2, b, !0);
        this.k.Kb(this.path.u(".priority"), a, null, b);
      };
      U.prototype.setPriority = U.prototype.Og;
      U.prototype.push = function(a, b) {
        x("Firebase.push", 0, 2, arguments.length);
        jg("Firebase.push", this.path);
        bg("Firebase.push", a, this.path, !0);
        A("Firebase.push", 2, b, !0);
        var c = $h(this.k),
            c = Fe(c),
            c = this.u(c);
        "undefined" !== typeof a && null !== a && c.set(a, b);
        return c;
      };
      U.prototype.push = U.prototype.push;
      U.prototype.hb = function() {
        jg("Firebase.onDisconnect", this.path);
        return new X(this.k, this.path);
      };
      U.prototype.onDisconnect = U.prototype.hb;
      U.prototype.M = function(a, b, c) {
        O("FirebaseRef.auth() being deprecated. Please use FirebaseRef.authWithCustomToken() instead.");
        x("Firebase.auth", 1, 3, arguments.length);
        kg("Firebase.auth", a);
        A("Firebase.auth", 2, b, !0);
        A("Firebase.auth", 3, b, !0);
        Yg(this.k.M, a, {}, {remember: "none"}, b, c);
      };
      U.prototype.auth = U.prototype.M;
      U.prototype.ge = function(a) {
        x("Firebase.unauth", 0, 1, arguments.length);
        A("Firebase.unauth", 1, a, !0);
        Zg(this.k.M, a);
      };
      U.prototype.unauth = U.prototype.ge;
      U.prototype.xe = function() {
        x("Firebase.getAuth", 0, 0, arguments.length);
        return this.k.M.xe();
      };
      U.prototype.getAuth = U.prototype.xe;
      U.prototype.xg = function(a, b) {
        x("Firebase.onAuth", 1, 2, arguments.length);
        A("Firebase.onAuth", 1, a, !1);
        mb("Firebase.onAuth", 2, b);
        this.k.M.Eb("auth_status", a, b);
      };
      U.prototype.onAuth = U.prototype.xg;
      U.prototype.wg = function(a, b) {
        x("Firebase.offAuth", 1, 2, arguments.length);
        A("Firebase.offAuth", 1, a, !1);
        mb("Firebase.offAuth", 2, b);
        this.k.M.ic("auth_status", a, b);
      };
      U.prototype.offAuth = U.prototype.wg;
      U.prototype.Zf = function(a, b, c) {
        x("Firebase.authWithCustomToken", 2, 3, arguments.length);
        kg("Firebase.authWithCustomToken", a);
        A("Firebase.authWithCustomToken", 2, b, !1);
        ng("Firebase.authWithCustomToken", 3, c, !0);
        Yg(this.k.M, a, {}, c || {}, b);
      };
      U.prototype.authWithCustomToken = U.prototype.Zf;
      U.prototype.$f = function(a, b, c) {
        x("Firebase.authWithOAuthPopup", 2, 3, arguments.length);
        mg("Firebase.authWithOAuthPopup", a);
        A("Firebase.authWithOAuthPopup", 2, b, !1);
        ng("Firebase.authWithOAuthPopup", 3, c, !0);
        ch(this.k.M, a, c, b);
      };
      U.prototype.authWithOAuthPopup = U.prototype.$f;
      U.prototype.ag = function(a, b, c) {
        x("Firebase.authWithOAuthRedirect", 2, 3, arguments.length);
        mg("Firebase.authWithOAuthRedirect", a);
        A("Firebase.authWithOAuthRedirect", 2, b, !1);
        ng("Firebase.authWithOAuthRedirect", 3, c, !0);
        var d = this.k.M;
        ah(d);
        var e = [Kg],
            f = vg(c);
        "anonymous" === a || "firebase" === a ? P(b, Mg("TRANSPORT_UNAVAILABLE")) : (yc.set("redirect_client_options", f.od), bh(d, e, "/auth/" + a, f, b));
      };
      U.prototype.authWithOAuthRedirect = U.prototype.ag;
      U.prototype.bg = function(a, b, c, d) {
        x("Firebase.authWithOAuthToken", 3, 4, arguments.length);
        mg("Firebase.authWithOAuthToken", a);
        A("Firebase.authWithOAuthToken", 3, c, !1);
        ng("Firebase.authWithOAuthToken", 4, d, !0);
        p(b) ? (lg("Firebase.authWithOAuthToken", 2, b), $g(this.k.M, a + "/token", {access_token: b}, d, c)) : (ng("Firebase.authWithOAuthToken", 2, b, !1), $g(this.k.M, a + "/token", b, d, c));
      };
      U.prototype.authWithOAuthToken = U.prototype.bg;
      U.prototype.Yf = function(a, b) {
        x("Firebase.authAnonymously", 1, 2, arguments.length);
        A("Firebase.authAnonymously", 1, a, !1);
        ng("Firebase.authAnonymously", 2, b, !0);
        $g(this.k.M, "anonymous", {}, b, a);
      };
      U.prototype.authAnonymously = U.prototype.Yf;
      U.prototype.cg = function(a, b, c) {
        x("Firebase.authWithPassword", 2, 3, arguments.length);
        ng("Firebase.authWithPassword", 1, a, !1);
        og("Firebase.authWithPassword", a, "email");
        og("Firebase.authWithPassword", a, "password");
        A("Firebase.authWithPassword", 2, b, !1);
        ng("Firebase.authWithPassword", 3, c, !0);
        $g(this.k.M, "password", a, c, b);
      };
      U.prototype.authWithPassword = U.prototype.cg;
      U.prototype.se = function(a, b) {
        x("Firebase.createUser", 2, 2, arguments.length);
        ng("Firebase.createUser", 1, a, !1);
        og("Firebase.createUser", a, "email");
        og("Firebase.createUser", a, "password");
        A("Firebase.createUser", 2, b, !1);
        this.k.M.se(a, b);
      };
      U.prototype.createUser = U.prototype.se;
      U.prototype.Te = function(a, b) {
        x("Firebase.removeUser", 2, 2, arguments.length);
        ng("Firebase.removeUser", 1, a, !1);
        og("Firebase.removeUser", a, "email");
        og("Firebase.removeUser", a, "password");
        A("Firebase.removeUser", 2, b, !1);
        this.k.M.Te(a, b);
      };
      U.prototype.removeUser = U.prototype.Te;
      U.prototype.pe = function(a, b) {
        x("Firebase.changePassword", 2, 2, arguments.length);
        ng("Firebase.changePassword", 1, a, !1);
        og("Firebase.changePassword", a, "email");
        og("Firebase.changePassword", a, "oldPassword");
        og("Firebase.changePassword", a, "newPassword");
        A("Firebase.changePassword", 2, b, !1);
        this.k.M.pe(a, b);
      };
      U.prototype.changePassword = U.prototype.pe;
      U.prototype.oe = function(a, b) {
        x("Firebase.changeEmail", 2, 2, arguments.length);
        ng("Firebase.changeEmail", 1, a, !1);
        og("Firebase.changeEmail", a, "oldEmail");
        og("Firebase.changeEmail", a, "newEmail");
        og("Firebase.changeEmail", a, "password");
        A("Firebase.changeEmail", 2, b, !1);
        this.k.M.oe(a, b);
      };
      U.prototype.changeEmail = U.prototype.oe;
      U.prototype.Ve = function(a, b) {
        x("Firebase.resetPassword", 2, 2, arguments.length);
        ng("Firebase.resetPassword", 1, a, !1);
        og("Firebase.resetPassword", a, "email");
        A("Firebase.resetPassword", 2, b, !1);
        this.k.M.Ve(a, b);
      };
      U.prototype.resetPassword = U.prototype.Ve;
    })();
  })();
  return _retrieveGlobal();
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.js", ["npm:core-js@0.9.18/library/modules/$.fw.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var global = typeof self != 'undefined' ? self : Function('return this')(),
      core = {},
      defineProperty = Object.defineProperty,
      hasOwnProperty = {}.hasOwnProperty,
      ceil = Math.ceil,
      floor = Math.floor,
      max = Math.max,
      min = Math.min;
  var DESC = !!function() {
    try {
      return defineProperty({}, 'a', {get: function() {
          return 2;
        }}).a == 2;
    } catch (e) {}
  }();
  var hide = createDefiner(1);
  function toInteger(it) {
    return isNaN(it = +it) ? 0 : (it > 0 ? floor : ceil)(it);
  }
  function desc(bitmap, value) {
    return {
      enumerable: !(bitmap & 1),
      configurable: !(bitmap & 2),
      writable: !(bitmap & 4),
      value: value
    };
  }
  function simpleSet(object, key, value) {
    object[key] = value;
    return object;
  }
  function createDefiner(bitmap) {
    return DESC ? function(object, key, value) {
      return $.setDesc(object, key, desc(bitmap, value));
    } : simpleSet;
  }
  function isObject(it) {
    return it !== null && (typeof it == 'object' || typeof it == 'function');
  }
  function isFunction(it) {
    return typeof it == 'function';
  }
  function assertDefined(it) {
    if (it == undefined)
      throw TypeError("Can't call method on  " + it);
    return it;
  }
  var $ = module.exports = require("npm:core-js@0.9.18/library/modules/$.fw.js")({
    g: global,
    core: core,
    html: global.document && document.documentElement,
    isObject: isObject,
    isFunction: isFunction,
    that: function() {
      return this;
    },
    toInteger: toInteger,
    toLength: function(it) {
      return it > 0 ? min(toInteger(it), 0x1fffffffffffff) : 0;
    },
    toIndex: function(index, length) {
      index = toInteger(index);
      return index < 0 ? max(index + length, 0) : min(index, length);
    },
    has: function(it, key) {
      return hasOwnProperty.call(it, key);
    },
    create: Object.create,
    getProto: Object.getPrototypeOf,
    DESC: DESC,
    desc: desc,
    getDesc: Object.getOwnPropertyDescriptor,
    setDesc: defineProperty,
    setDescs: Object.defineProperties,
    getKeys: Object.keys,
    getNames: Object.getOwnPropertyNames,
    getSymbols: Object.getOwnPropertySymbols,
    assertDefined: assertDefined,
    ES5Object: Object,
    toObject: function(it) {
      return $.ES5Object(assertDefined(it));
    },
    hide: hide,
    def: createDefiner(0),
    set: global.Symbol ? simpleSet : hide,
    each: [].forEach
  });
  if (typeof __e != 'undefined')
    __e = core;
  if (typeof __g != 'undefined')
    __g = global;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/es6.object.statics-accept-primitives.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.def.js", "npm:core-js@0.9.18/library/modules/$.get-names.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      $def = require("npm:core-js@0.9.18/library/modules/$.def.js"),
      isObject = $.isObject,
      toObject = $.toObject;
  $.each.call(('freeze,seal,preventExtensions,isFrozen,isSealed,isExtensible,' + 'getOwnPropertyDescriptor,getPrototypeOf,keys,getOwnPropertyNames').split(','), function(KEY, ID) {
    var fn = ($.core.Object || {})[KEY] || Object[KEY],
        forced = 0,
        method = {};
    method[KEY] = ID == 0 ? function freeze(it) {
      return isObject(it) ? fn(it) : it;
    } : ID == 1 ? function seal(it) {
      return isObject(it) ? fn(it) : it;
    } : ID == 2 ? function preventExtensions(it) {
      return isObject(it) ? fn(it) : it;
    } : ID == 3 ? function isFrozen(it) {
      return isObject(it) ? fn(it) : true;
    } : ID == 4 ? function isSealed(it) {
      return isObject(it) ? fn(it) : true;
    } : ID == 5 ? function isExtensible(it) {
      return isObject(it) ? fn(it) : false;
    } : ID == 6 ? function getOwnPropertyDescriptor(it, key) {
      return fn(toObject(it), key);
    } : ID == 7 ? function getPrototypeOf(it) {
      return fn(Object($.assertDefined(it)));
    } : ID == 8 ? function keys(it) {
      return fn(toObject(it));
    } : require("npm:core-js@0.9.18/library/modules/$.get-names.js").get;
    try {
      fn('z');
    } catch (e) {
      forced = 1;
    }
    $def($def.S + $def.F * forced, 'Object', method);
  });
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/core-js/object/create.js", ["npm:core-js@0.9.18/library/fn/object/create.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/object/create.js"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.set-proto.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.assert.js", "npm:core-js@0.9.18/library/modules/$.ctx.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      assert = require("npm:core-js@0.9.18/library/modules/$.assert.js");
  function check(O, proto) {
    assert.obj(O);
    assert(proto === null || $.isObject(proto), proto, ": can't set as prototype!");
  }
  module.exports = {
    set: Object.setPrototypeOf || ('__proto__' in {} ? function(buggy, set) {
      try {
        set = require("npm:core-js@0.9.18/library/modules/$.ctx.js")(Function.call, $.getDesc(Object.prototype, '__proto__').set, 2);
        set({}, []);
      } catch (e) {
        buggy = true;
      }
      return function setPrototypeOf(O, proto) {
        check(O, proto);
        if (buggy)
          O.__proto__ = proto;
        else
          set(O, proto);
        return O;
      };
    }() : undefined),
    check: check
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/core-js/object/get-own-property-names.js", ["npm:core-js@0.9.18/library/fn/object/get-own-property-names.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/object/get-own-property-names.js"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.wks.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.shared.js", "npm:core-js@0.9.18/library/modules/$.uid.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var global = require("npm:core-js@0.9.18/library/modules/$.js").g,
      store = require("npm:core-js@0.9.18/library/modules/$.shared.js")('wks');
  module.exports = function(name) {
    return store[name] || (store[name] = global.Symbol && global.Symbol[name] || require("npm:core-js@0.9.18/library/modules/$.uid.js").safe('Symbol.' + name));
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.iter-define.js", ["npm:core-js@0.9.18/library/modules/$.def.js", "npm:core-js@0.9.18/library/modules/$.redef.js", "npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.cof.js", "npm:core-js@0.9.18/library/modules/$.iter.js", "npm:core-js@0.9.18/library/modules/$.wks.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.18/library/modules/$.def.js"),
      $redef = require("npm:core-js@0.9.18/library/modules/$.redef.js"),
      $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      cof = require("npm:core-js@0.9.18/library/modules/$.cof.js"),
      $iter = require("npm:core-js@0.9.18/library/modules/$.iter.js"),
      SYMBOL_ITERATOR = require("npm:core-js@0.9.18/library/modules/$.wks.js")('iterator'),
      FF_ITERATOR = '@@iterator',
      KEYS = 'keys',
      VALUES = 'values',
      Iterators = $iter.Iterators;
  module.exports = function(Base, NAME, Constructor, next, DEFAULT, IS_SET, FORCE) {
    $iter.create(Constructor, NAME, next);
    function createMethod(kind) {
      function $$(that) {
        return new Constructor(that, kind);
      }
      switch (kind) {
        case KEYS:
          return function keys() {
            return $$(this);
          };
        case VALUES:
          return function values() {
            return $$(this);
          };
      }
      return function entries() {
        return $$(this);
      };
    }
    var TAG = NAME + ' Iterator',
        proto = Base.prototype,
        _native = proto[SYMBOL_ITERATOR] || proto[FF_ITERATOR] || DEFAULT && proto[DEFAULT],
        _default = _native || createMethod(DEFAULT),
        methods,
        key;
    if (_native) {
      var IteratorPrototype = $.getProto(_default.call(new Base));
      cof.set(IteratorPrototype, TAG, true);
      if ($.FW && $.has(proto, FF_ITERATOR))
        $iter.set(IteratorPrototype, $.that);
    }
    if ($.FW || FORCE)
      $iter.set(proto, _default);
    Iterators[NAME] = _default;
    Iterators[TAG] = $.that;
    if (DEFAULT) {
      methods = {
        keys: IS_SET ? _default : createMethod(KEYS),
        values: DEFAULT == VALUES ? _default : createMethod(VALUES),
        entries: DEFAULT != VALUES ? _default : createMethod('entries')
      };
      if (FORCE)
        for (key in methods) {
          if (!(key in proto))
            $redef(proto, key, methods[key]);
        }
      else
        $def($def.P + $def.F * $iter.BUGGY, NAME, methods);
    }
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/es6.string.iterator.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.string-at.js", "npm:core-js@0.9.18/library/modules/$.uid.js", "npm:core-js@0.9.18/library/modules/$.iter.js", "npm:core-js@0.9.18/library/modules/$.iter-define.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var set = require("npm:core-js@0.9.18/library/modules/$.js").set,
      $at = require("npm:core-js@0.9.18/library/modules/$.string-at.js")(true),
      ITER = require("npm:core-js@0.9.18/library/modules/$.uid.js").safe('iter'),
      $iter = require("npm:core-js@0.9.18/library/modules/$.iter.js"),
      step = $iter.step;
  require("npm:core-js@0.9.18/library/modules/$.iter-define.js")(String, 'String', function(iterated) {
    set(this, ITER, {
      o: String(iterated),
      i: 0
    });
  }, function() {
    var iter = this[ITER],
        O = iter.o,
        index = iter.i,
        point;
    if (index >= O.length)
      return step(1);
    point = $at(O, index);
    iter.i += point.length;
    return step(0, point);
  });
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:process@0.11.2.js", ["npm:process@0.11.2/browser.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = require("npm:process@0.11.2/browser.js");
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.for-of.js", ["npm:core-js@0.9.18/library/modules/$.ctx.js", "npm:core-js@0.9.18/library/modules/$.iter.js", "npm:core-js@0.9.18/library/modules/$.iter-call.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var ctx = require("npm:core-js@0.9.18/library/modules/$.ctx.js"),
      get = require("npm:core-js@0.9.18/library/modules/$.iter.js").get,
      call = require("npm:core-js@0.9.18/library/modules/$.iter-call.js");
  module.exports = function(iterable, entries, fn, that) {
    var iterator = get(iterable),
        f = ctx(fn, that, entries ? 2 : 1),
        step;
    while (!(step = iterator.next()).done) {
      if (call(iterator, f, step.value, entries) === false) {
        return call.close(iterator);
      }
    }
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.collection.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.def.js", "npm:core-js@0.9.18/library/modules/$.iter.js", "npm:core-js@0.9.18/library/modules/$.for-of.js", "npm:core-js@0.9.18/library/modules/$.assert.js", "npm:core-js@0.9.18/library/modules/$.uid.js", "npm:core-js@0.9.18/library/modules/$.mix.js", "npm:core-js@0.9.18/library/modules/$.cof.js", "npm:core-js@0.9.18/library/modules/$.species.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      $def = require("npm:core-js@0.9.18/library/modules/$.def.js"),
      $iter = require("npm:core-js@0.9.18/library/modules/$.iter.js"),
      BUGGY = $iter.BUGGY,
      forOf = require("npm:core-js@0.9.18/library/modules/$.for-of.js"),
      assertInstance = require("npm:core-js@0.9.18/library/modules/$.assert.js").inst,
      INTERNAL = require("npm:core-js@0.9.18/library/modules/$.uid.js").safe('internal');
  module.exports = function(NAME, wrapper, methods, common, IS_MAP, IS_WEAK) {
    var Base = $.g[NAME],
        C = Base,
        ADDER = IS_MAP ? 'set' : 'add',
        proto = C && C.prototype,
        O = {};
    if (!$.DESC || !$.isFunction(C) || !(IS_WEAK || !BUGGY && proto.forEach && proto.entries)) {
      C = common.getConstructor(wrapper, NAME, IS_MAP, ADDER);
      require("npm:core-js@0.9.18/library/modules/$.mix.js")(C.prototype, methods);
    } else {
      C = wrapper(function(target, iterable) {
        assertInstance(target, C, NAME);
        target[INTERNAL] = new Base;
        if (iterable != undefined)
          forOf(iterable, IS_MAP, target[ADDER], target);
      });
      $.each.call('add,clear,delete,forEach,get,has,set,keys,values,entries'.split(','), function(KEY) {
        var chain = KEY == 'add' || KEY == 'set';
        if (KEY in proto)
          $.hide(C.prototype, KEY, function(a, b) {
            var result = this[INTERNAL][KEY](a === 0 ? 0 : a, b);
            return chain ? this : result;
          });
      });
      if ('size' in proto)
        $.setDesc(C.prototype, 'size', {get: function() {
            return this[INTERNAL].size;
          }});
    }
    require("npm:core-js@0.9.18/library/modules/$.cof.js").set(C, NAME);
    O[NAME] = C;
    $def($def.G + $def.W + $def.F, O);
    require("npm:core-js@0.9.18/library/modules/$.species.js")(C);
    if (!IS_WEAK)
      common.setIter(C, NAME, IS_MAP);
    return C;
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/es7.map.to-json.js", ["npm:core-js@0.9.18/library/modules/$.collection-to-json.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.18/library/modules/$.collection-to-json.js")('Map');
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.task.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.ctx.js", "npm:core-js@0.9.18/library/modules/$.cof.js", "npm:core-js@0.9.18/library/modules/$.invoke.js", "npm:core-js@0.9.18/library/modules/$.dom-create.js", "github:jspm/nodelibs-process@0.1.2.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    'use strict';
    var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
        ctx = require("npm:core-js@0.9.18/library/modules/$.ctx.js"),
        cof = require("npm:core-js@0.9.18/library/modules/$.cof.js"),
        invoke = require("npm:core-js@0.9.18/library/modules/$.invoke.js"),
        cel = require("npm:core-js@0.9.18/library/modules/$.dom-create.js"),
        global = $.g,
        isFunction = $.isFunction,
        html = $.html,
        process = global.process,
        setTask = global.setImmediate,
        clearTask = global.clearImmediate,
        MessageChannel = global.MessageChannel,
        counter = 0,
        queue = {},
        ONREADYSTATECHANGE = 'onreadystatechange',
        defer,
        channel,
        port;
    function run() {
      var id = +this;
      if ($.has(queue, id)) {
        var fn = queue[id];
        delete queue[id];
        fn();
      }
    }
    function listner(event) {
      run.call(event.data);
    }
    if (!isFunction(setTask) || !isFunction(clearTask)) {
      setTask = function(fn) {
        var args = [],
            i = 1;
        while (arguments.length > i)
          args.push(arguments[i++]);
        queue[++counter] = function() {
          invoke(isFunction(fn) ? fn : Function(fn), args);
        };
        defer(counter);
        return counter;
      };
      clearTask = function(id) {
        delete queue[id];
      };
      if (cof(process) == 'process') {
        defer = function(id) {
          process.nextTick(ctx(run, id, 1));
        };
      } else if (global.addEventListener && isFunction(global.postMessage) && !global.importScripts) {
        defer = function(id) {
          global.postMessage(id, '*');
        };
        global.addEventListener('message', listner, false);
      } else if (isFunction(MessageChannel)) {
        channel = new MessageChannel;
        port = channel.port2;
        channel.port1.onmessage = listner;
        defer = ctx(port.postMessage, port, 1);
      } else if (ONREADYSTATECHANGE in cel('script')) {
        defer = function(id) {
          html.appendChild(cel('script'))[ONREADYSTATECHANGE] = function() {
            html.removeChild(this);
            run.call(id);
          };
        };
      } else {
        defer = function(id) {
          setTimeout(ctx(run, id, 1), 0);
        };
      }
    }
    module.exports = {
      set: setTask,
      clear: clearTask
    };
  })(require("github:jspm/nodelibs-process@0.1.2.js"));
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/es6.reflect.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.def.js", "npm:core-js@0.9.18/library/modules/$.set-proto.js", "npm:core-js@0.9.18/library/modules/$.iter.js", "npm:core-js@0.9.18/library/modules/$.wks.js", "npm:core-js@0.9.18/library/modules/$.uid.js", "npm:core-js@0.9.18/library/modules/$.assert.js", "npm:core-js@0.9.18/library/modules/$.own-keys.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      $def = require("npm:core-js@0.9.18/library/modules/$.def.js"),
      setProto = require("npm:core-js@0.9.18/library/modules/$.set-proto.js"),
      $iter = require("npm:core-js@0.9.18/library/modules/$.iter.js"),
      ITERATOR = require("npm:core-js@0.9.18/library/modules/$.wks.js")('iterator'),
      ITER = require("npm:core-js@0.9.18/library/modules/$.uid.js").safe('iter'),
      step = $iter.step,
      assert = require("npm:core-js@0.9.18/library/modules/$.assert.js"),
      isObject = $.isObject,
      getProto = $.getProto,
      $Reflect = $.g.Reflect,
      _apply = Function.apply,
      assertObject = assert.obj,
      _isExtensible = Object.isExtensible || isObject,
      _preventExtensions = Object.preventExtensions,
      buggyEnumerate = !($Reflect && $Reflect.enumerate && ITERATOR in $Reflect.enumerate({}));
  function Enumerate(iterated) {
    $.set(this, ITER, {
      o: iterated,
      k: undefined,
      i: 0
    });
  }
  $iter.create(Enumerate, 'Object', function() {
    var iter = this[ITER],
        keys = iter.k,
        key;
    if (keys == undefined) {
      iter.k = keys = [];
      for (key in iter.o)
        keys.push(key);
    }
    do {
      if (iter.i >= keys.length)
        return step(1);
    } while (!((key = keys[iter.i++]) in iter.o));
    return step(0, key);
  });
  var reflect = {
    apply: function apply(target, thisArgument, argumentsList) {
      return _apply.call(target, thisArgument, argumentsList);
    },
    construct: function construct(target, argumentsList) {
      var proto = assert.fn(arguments.length < 3 ? target : arguments[2]).prototype,
          instance = $.create(isObject(proto) ? proto : Object.prototype),
          result = _apply.call(target, instance, argumentsList);
      return isObject(result) ? result : instance;
    },
    defineProperty: function defineProperty(target, propertyKey, attributes) {
      assertObject(target);
      try {
        $.setDesc(target, propertyKey, attributes);
        return true;
      } catch (e) {
        return false;
      }
    },
    deleteProperty: function deleteProperty(target, propertyKey) {
      var desc = $.getDesc(assertObject(target), propertyKey);
      return desc && !desc.configurable ? false : delete target[propertyKey];
    },
    get: function get(target, propertyKey) {
      var receiver = arguments.length < 3 ? target : arguments[2],
          desc = $.getDesc(assertObject(target), propertyKey),
          proto;
      if (desc)
        return $.has(desc, 'value') ? desc.value : desc.get === undefined ? undefined : desc.get.call(receiver);
      return isObject(proto = getProto(target)) ? get(proto, propertyKey, receiver) : undefined;
    },
    getOwnPropertyDescriptor: function getOwnPropertyDescriptor(target, propertyKey) {
      return $.getDesc(assertObject(target), propertyKey);
    },
    getPrototypeOf: function getPrototypeOf(target) {
      return getProto(assertObject(target));
    },
    has: function has(target, propertyKey) {
      return propertyKey in target;
    },
    isExtensible: function isExtensible(target) {
      return _isExtensible(assertObject(target));
    },
    ownKeys: require("npm:core-js@0.9.18/library/modules/$.own-keys.js"),
    preventExtensions: function preventExtensions(target) {
      assertObject(target);
      try {
        if (_preventExtensions)
          _preventExtensions(target);
        return true;
      } catch (e) {
        return false;
      }
    },
    set: function set(target, propertyKey, V) {
      var receiver = arguments.length < 4 ? target : arguments[3],
          ownDesc = $.getDesc(assertObject(target), propertyKey),
          existingDescriptor,
          proto;
      if (!ownDesc) {
        if (isObject(proto = getProto(target))) {
          return set(proto, propertyKey, V, receiver);
        }
        ownDesc = $.desc(0);
      }
      if ($.has(ownDesc, 'value')) {
        if (ownDesc.writable === false || !isObject(receiver))
          return false;
        existingDescriptor = $.getDesc(receiver, propertyKey) || $.desc(0);
        existingDescriptor.value = V;
        $.setDesc(receiver, propertyKey, existingDescriptor);
        return true;
      }
      return ownDesc.set === undefined ? false : (ownDesc.set.call(receiver, V), true);
    }
  };
  if (setProto)
    reflect.setPrototypeOf = function setPrototypeOf(target, proto) {
      setProto.check(target, proto);
      try {
        setProto.set(target, proto);
        return true;
      } catch (e) {
        return false;
      }
    };
  $def($def.G, {Reflect: {}});
  $def($def.S + $def.F * buggyEnumerate, 'Reflect', {enumerate: function enumerate(target) {
      return new Enumerate(assertObject(target));
    }});
  $def($def.S, 'Reflect', reflect);
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/es6.symbol.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.cof.js", "npm:core-js@0.9.18/library/modules/$.uid.js", "npm:core-js@0.9.18/library/modules/$.shared.js", "npm:core-js@0.9.18/library/modules/$.def.js", "npm:core-js@0.9.18/library/modules/$.redef.js", "npm:core-js@0.9.18/library/modules/$.keyof.js", "npm:core-js@0.9.18/library/modules/$.enum-keys.js", "npm:core-js@0.9.18/library/modules/$.assert.js", "npm:core-js@0.9.18/library/modules/$.get-names.js", "npm:core-js@0.9.18/library/modules/$.wks.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      setTag = require("npm:core-js@0.9.18/library/modules/$.cof.js").set,
      uid = require("npm:core-js@0.9.18/library/modules/$.uid.js"),
      shared = require("npm:core-js@0.9.18/library/modules/$.shared.js"),
      $def = require("npm:core-js@0.9.18/library/modules/$.def.js"),
      $redef = require("npm:core-js@0.9.18/library/modules/$.redef.js"),
      keyOf = require("npm:core-js@0.9.18/library/modules/$.keyof.js"),
      enumKeys = require("npm:core-js@0.9.18/library/modules/$.enum-keys.js"),
      assertObject = require("npm:core-js@0.9.18/library/modules/$.assert.js").obj,
      ObjectProto = Object.prototype,
      DESC = $.DESC,
      has = $.has,
      $create = $.create,
      getDesc = $.getDesc,
      setDesc = $.setDesc,
      desc = $.desc,
      $names = require("npm:core-js@0.9.18/library/modules/$.get-names.js"),
      getNames = $names.get,
      toObject = $.toObject,
      $Symbol = $.g.Symbol,
      setter = false,
      TAG = uid('tag'),
      HIDDEN = uid('hidden'),
      _propertyIsEnumerable = {}.propertyIsEnumerable,
      SymbolRegistry = shared('symbol-registry'),
      AllSymbols = shared('symbols'),
      useNative = $.isFunction($Symbol);
  var setSymbolDesc = DESC ? function() {
    try {
      return $create(setDesc({}, HIDDEN, {get: function() {
          return setDesc(this, HIDDEN, {value: false})[HIDDEN];
        }}))[HIDDEN] || setDesc;
    } catch (e) {
      return function(it, key, D) {
        var protoDesc = getDesc(ObjectProto, key);
        if (protoDesc)
          delete ObjectProto[key];
        setDesc(it, key, D);
        if (protoDesc && it !== ObjectProto)
          setDesc(ObjectProto, key, protoDesc);
      };
    }
  }() : setDesc;
  function wrap(tag) {
    var sym = AllSymbols[tag] = $.set($create($Symbol.prototype), TAG, tag);
    DESC && setter && setSymbolDesc(ObjectProto, tag, {
      configurable: true,
      set: function(value) {
        if (has(this, HIDDEN) && has(this[HIDDEN], tag))
          this[HIDDEN][tag] = false;
        setSymbolDesc(this, tag, desc(1, value));
      }
    });
    return sym;
  }
  function defineProperty(it, key, D) {
    if (D && has(AllSymbols, key)) {
      if (!D.enumerable) {
        if (!has(it, HIDDEN))
          setDesc(it, HIDDEN, desc(1, {}));
        it[HIDDEN][key] = true;
      } else {
        if (has(it, HIDDEN) && it[HIDDEN][key])
          it[HIDDEN][key] = false;
        D = $create(D, {enumerable: desc(0, false)});
      }
      return setSymbolDesc(it, key, D);
    }
    return setDesc(it, key, D);
  }
  function defineProperties(it, P) {
    assertObject(it);
    var keys = enumKeys(P = toObject(P)),
        i = 0,
        l = keys.length,
        key;
    while (l > i)
      defineProperty(it, key = keys[i++], P[key]);
    return it;
  }
  function create(it, P) {
    return P === undefined ? $create(it) : defineProperties($create(it), P);
  }
  function propertyIsEnumerable(key) {
    var E = _propertyIsEnumerable.call(this, key);
    return E || !has(this, key) || !has(AllSymbols, key) || has(this, HIDDEN) && this[HIDDEN][key] ? E : true;
  }
  function getOwnPropertyDescriptor(it, key) {
    var D = getDesc(it = toObject(it), key);
    if (D && has(AllSymbols, key) && !(has(it, HIDDEN) && it[HIDDEN][key]))
      D.enumerable = true;
    return D;
  }
  function getOwnPropertyNames(it) {
    var names = getNames(toObject(it)),
        result = [],
        i = 0,
        key;
    while (names.length > i)
      if (!has(AllSymbols, key = names[i++]) && key != HIDDEN)
        result.push(key);
    return result;
  }
  function getOwnPropertySymbols(it) {
    var names = getNames(toObject(it)),
        result = [],
        i = 0,
        key;
    while (names.length > i)
      if (has(AllSymbols, key = names[i++]))
        result.push(AllSymbols[key]);
    return result;
  }
  if (!useNative) {
    $Symbol = function Symbol() {
      if (this instanceof $Symbol)
        throw TypeError('Symbol is not a constructor');
      return wrap(uid(arguments[0]));
    };
    $redef($Symbol.prototype, 'toString', function() {
      return this[TAG];
    });
    $.create = create;
    $.setDesc = defineProperty;
    $.getDesc = getOwnPropertyDescriptor;
    $.setDescs = defineProperties;
    $.getNames = $names.get = getOwnPropertyNames;
    $.getSymbols = getOwnPropertySymbols;
    if ($.DESC && $.FW)
      $redef(ObjectProto, 'propertyIsEnumerable', propertyIsEnumerable, true);
  }
  var symbolStatics = {
    'for': function(key) {
      return has(SymbolRegistry, key += '') ? SymbolRegistry[key] : SymbolRegistry[key] = $Symbol(key);
    },
    keyFor: function keyFor(key) {
      return keyOf(SymbolRegistry, key);
    },
    useSetter: function() {
      setter = true;
    },
    useSimple: function() {
      setter = false;
    }
  };
  $.each.call(('hasInstance,isConcatSpreadable,iterator,match,replace,search,' + 'species,split,toPrimitive,toStringTag,unscopables').split(','), function(it) {
    var sym = require("npm:core-js@0.9.18/library/modules/$.wks.js")(it);
    symbolStatics[it] = useNative ? sym : wrap(sym);
  });
  setter = true;
  $def($def.G + $def.W, {Symbol: $Symbol});
  $def($def.S, 'Symbol', symbolStatics);
  $def($def.S + $def.F * !useNative, 'Object', {
    create: create,
    defineProperty: defineProperty,
    defineProperties: defineProperties,
    getOwnPropertyDescriptor: getOwnPropertyDescriptor,
    getOwnPropertyNames: getOwnPropertyNames,
    getOwnPropertySymbols: getOwnPropertySymbols
  });
  setTag($Symbol, 'Symbol');
  setTag(Math, 'Math', true);
  setTag($.g.JSON, 'JSON', true);
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/core-js/object/keys.js", ["npm:core-js@0.9.18/library/fn/object/keys.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/object/keys.js"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:eventemitter3@1.1.1.js", ["npm:eventemitter3@1.1.1/index.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = require("npm:eventemitter3@1.1.1/index.js");
  global.define = __define;
  return module.exports;
});

System.registerDynamic("github:firebase/firebase-bower@2.3.1.js", ["github:firebase/firebase-bower@2.3.1/firebase.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = require("github:firebase/firebase-bower@2.3.1/firebase.js");
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/fn/object/define-property.js", ["npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js");
  module.exports = function defineProperty(it, key, desc) {
    return $.setDesc(it, key, desc);
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/fn/object/get-own-property-descriptor.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/es6.object.statics-accept-primitives.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js");
  require("npm:core-js@0.9.18/library/modules/es6.object.statics-accept-primitives.js");
  module.exports = function getOwnPropertyDescriptor(it, key) {
    return $.getDesc(it, key);
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/es6.object.set-prototype-of.js", ["npm:core-js@0.9.18/library/modules/$.def.js", "npm:core-js@0.9.18/library/modules/$.set-proto.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $def = require("npm:core-js@0.9.18/library/modules/$.def.js");
  $def($def.S, 'Object', {setPrototypeOf: require("npm:core-js@0.9.18/library/modules/$.set-proto.js").set});
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.cof.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.wks.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      TAG = require("npm:core-js@0.9.18/library/modules/$.wks.js")('toStringTag'),
      toString = {}.toString;
  function cof(it) {
    return toString.call(it).slice(8, -1);
  }
  cof.classof = function(it) {
    var O,
        T;
    return it == undefined ? it === undefined ? 'Undefined' : 'Null' : typeof(T = (O = Object(it))[TAG]) == 'string' ? T : cof(O);
  };
  cof.set = function(it, tag, stat) {
    if (it && !$.has(it = stat ? it : it.prototype, TAG))
      $.hide(it, TAG, tag);
  };
  module.exports = cof;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("github:jspm/nodelibs-process@0.1.2/index.js", ["npm:process@0.11.2.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = System._nodeRequire ? process : require("npm:process@0.11.2.js");
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.collection-strong.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.ctx.js", "npm:core-js@0.9.18/library/modules/$.uid.js", "npm:core-js@0.9.18/library/modules/$.assert.js", "npm:core-js@0.9.18/library/modules/$.for-of.js", "npm:core-js@0.9.18/library/modules/$.iter.js", "npm:core-js@0.9.18/library/modules/$.mix.js", "npm:core-js@0.9.18/library/modules/$.iter-define.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      ctx = require("npm:core-js@0.9.18/library/modules/$.ctx.js"),
      safe = require("npm:core-js@0.9.18/library/modules/$.uid.js").safe,
      assert = require("npm:core-js@0.9.18/library/modules/$.assert.js"),
      forOf = require("npm:core-js@0.9.18/library/modules/$.for-of.js"),
      step = require("npm:core-js@0.9.18/library/modules/$.iter.js").step,
      $has = $.has,
      set = $.set,
      isObject = $.isObject,
      hide = $.hide,
      isExtensible = Object.isExtensible || isObject,
      ID = safe('id'),
      O1 = safe('O1'),
      LAST = safe('last'),
      FIRST = safe('first'),
      ITER = safe('iter'),
      SIZE = $.DESC ? safe('size') : 'size',
      id = 0;
  function fastKey(it, create) {
    if (!isObject(it))
      return typeof it == 'symbol' ? it : (typeof it == 'string' ? 'S' : 'P') + it;
    if (!$has(it, ID)) {
      if (!isExtensible(it))
        return 'F';
      if (!create)
        return 'E';
      hide(it, ID, ++id);
    }
    return 'O' + it[ID];
  }
  function getEntry(that, key) {
    var index = fastKey(key),
        entry;
    if (index !== 'F')
      return that[O1][index];
    for (entry = that[FIRST]; entry; entry = entry.n) {
      if (entry.k == key)
        return entry;
    }
  }
  module.exports = {
    getConstructor: function(wrapper, NAME, IS_MAP, ADDER) {
      var C = wrapper(function(that, iterable) {
        assert.inst(that, C, NAME);
        set(that, O1, $.create(null));
        set(that, SIZE, 0);
        set(that, LAST, undefined);
        set(that, FIRST, undefined);
        if (iterable != undefined)
          forOf(iterable, IS_MAP, that[ADDER], that);
      });
      require("npm:core-js@0.9.18/library/modules/$.mix.js")(C.prototype, {
        clear: function clear() {
          for (var that = this,
              data = that[O1],
              entry = that[FIRST]; entry; entry = entry.n) {
            entry.r = true;
            if (entry.p)
              entry.p = entry.p.n = undefined;
            delete data[entry.i];
          }
          that[FIRST] = that[LAST] = undefined;
          that[SIZE] = 0;
        },
        'delete': function(key) {
          var that = this,
              entry = getEntry(that, key);
          if (entry) {
            var next = entry.n,
                prev = entry.p;
            delete that[O1][entry.i];
            entry.r = true;
            if (prev)
              prev.n = next;
            if (next)
              next.p = prev;
            if (that[FIRST] == entry)
              that[FIRST] = next;
            if (that[LAST] == entry)
              that[LAST] = prev;
            that[SIZE]--;
          }
          return !!entry;
        },
        forEach: function forEach(callbackfn) {
          var f = ctx(callbackfn, arguments[1], 3),
              entry;
          while (entry = entry ? entry.n : this[FIRST]) {
            f(entry.v, entry.k, this);
            while (entry && entry.r)
              entry = entry.p;
          }
        },
        has: function has(key) {
          return !!getEntry(this, key);
        }
      });
      if ($.DESC)
        $.setDesc(C.prototype, 'size', {get: function() {
            return assert.def(this[SIZE]);
          }});
      return C;
    },
    def: function(that, key, value) {
      var entry = getEntry(that, key),
          prev,
          index;
      if (entry) {
        entry.v = value;
      } else {
        that[LAST] = entry = {
          i: index = fastKey(key, true),
          k: key,
          v: value,
          p: prev = that[LAST],
          n: undefined,
          r: false
        };
        if (!that[FIRST])
          that[FIRST] = entry;
        if (prev)
          prev.n = entry;
        that[SIZE]++;
        if (index !== 'F')
          that[O1][index] = entry;
      }
      return that;
    },
    getEntry: getEntry,
    setIter: function(C, NAME, IS_MAP) {
      require("npm:core-js@0.9.18/library/modules/$.iter-define.js")(C, NAME, function(iterated, kind) {
        set(this, ITER, {
          o: iterated,
          k: kind
        });
      }, function() {
        var iter = this[ITER],
            kind = iter.k,
            entry = iter.l;
        while (entry && entry.r)
          entry = entry.p;
        if (!iter.o || !(iter.l = entry = entry ? entry.n : iter.o[FIRST])) {
          iter.o = undefined;
          return step(1);
        }
        if (kind == 'keys')
          return step(0, entry.k);
        if (kind == 'values')
          return step(0, entry.v);
        return step(0, [entry.k, entry.v]);
      }, IS_MAP ? 'entries' : 'values', !IS_MAP, true);
    }
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/es6.promise.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.ctx.js", "npm:core-js@0.9.18/library/modules/$.cof.js", "npm:core-js@0.9.18/library/modules/$.def.js", "npm:core-js@0.9.18/library/modules/$.assert.js", "npm:core-js@0.9.18/library/modules/$.for-of.js", "npm:core-js@0.9.18/library/modules/$.set-proto.js", "npm:core-js@0.9.18/library/modules/$.same.js", "npm:core-js@0.9.18/library/modules/$.species.js", "npm:core-js@0.9.18/library/modules/$.wks.js", "npm:core-js@0.9.18/library/modules/$.uid.js", "npm:core-js@0.9.18/library/modules/$.task.js", "npm:core-js@0.9.18/library/modules/$.mix.js", "npm:core-js@0.9.18/library/modules/$.iter-detect.js", "github:jspm/nodelibs-process@0.1.2.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    'use strict';
    var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
        ctx = require("npm:core-js@0.9.18/library/modules/$.ctx.js"),
        cof = require("npm:core-js@0.9.18/library/modules/$.cof.js"),
        $def = require("npm:core-js@0.9.18/library/modules/$.def.js"),
        assert = require("npm:core-js@0.9.18/library/modules/$.assert.js"),
        forOf = require("npm:core-js@0.9.18/library/modules/$.for-of.js"),
        setProto = require("npm:core-js@0.9.18/library/modules/$.set-proto.js").set,
        same = require("npm:core-js@0.9.18/library/modules/$.same.js"),
        species = require("npm:core-js@0.9.18/library/modules/$.species.js"),
        SPECIES = require("npm:core-js@0.9.18/library/modules/$.wks.js")('species'),
        RECORD = require("npm:core-js@0.9.18/library/modules/$.uid.js").safe('record'),
        PROMISE = 'Promise',
        global = $.g,
        process = global.process,
        isNode = cof(process) == 'process',
        asap = process && process.nextTick || require("npm:core-js@0.9.18/library/modules/$.task.js").set,
        P = global[PROMISE],
        isFunction = $.isFunction,
        isObject = $.isObject,
        assertFunction = assert.fn,
        assertObject = assert.obj,
        Wrapper;
    function testResolve(sub) {
      var test = new P(function() {});
      if (sub)
        test.constructor = Object;
      return P.resolve(test) === test;
    }
    var useNative = function() {
      var works = false;
      function P2(x) {
        var self = new P(x);
        setProto(self, P2.prototype);
        return self;
      }
      try {
        works = isFunction(P) && isFunction(P.resolve) && testResolve();
        setProto(P2, P);
        P2.prototype = $.create(P.prototype, {constructor: {value: P2}});
        if (!(P2.resolve(5).then(function() {}) instanceof P2)) {
          works = false;
        }
        if (works && $.DESC) {
          var thenableThenGotten = false;
          P.resolve($.setDesc({}, 'then', {get: function() {
              thenableThenGotten = true;
            }}));
          works = thenableThenGotten;
        }
      } catch (e) {
        works = false;
      }
      return works;
    }();
    function isPromise(it) {
      return isObject(it) && (useNative ? cof.classof(it) == 'Promise' : RECORD in it);
    }
    function sameConstructor(a, b) {
      if (!$.FW && a === P && b === Wrapper)
        return true;
      return same(a, b);
    }
    function getConstructor(C) {
      var S = assertObject(C)[SPECIES];
      return S != undefined ? S : C;
    }
    function isThenable(it) {
      var then;
      if (isObject(it))
        then = it.then;
      return isFunction(then) ? then : false;
    }
    function notify(record) {
      var chain = record.c;
      if (chain.length)
        asap.call(global, function() {
          var value = record.v,
              ok = record.s == 1,
              i = 0;
          function run(react) {
            var cb = ok ? react.ok : react.fail,
                ret,
                then;
            try {
              if (cb) {
                if (!ok)
                  record.h = true;
                ret = cb === true ? value : cb(value);
                if (ret === react.P) {
                  react.rej(TypeError('Promise-chain cycle'));
                } else if (then = isThenable(ret)) {
                  then.call(ret, react.res, react.rej);
                } else
                  react.res(ret);
              } else
                react.rej(value);
            } catch (err) {
              react.rej(err);
            }
          }
          while (chain.length > i)
            run(chain[i++]);
          chain.length = 0;
        });
    }
    function isUnhandled(promise) {
      var record = promise[RECORD],
          chain = record.a || record.c,
          i = 0,
          react;
      if (record.h)
        return false;
      while (chain.length > i) {
        react = chain[i++];
        if (react.fail || !isUnhandled(react.P))
          return false;
      }
      return true;
    }
    function $reject(value) {
      var record = this,
          promise;
      if (record.d)
        return;
      record.d = true;
      record = record.r || record;
      record.v = value;
      record.s = 2;
      record.a = record.c.slice();
      setTimeout(function() {
        asap.call(global, function() {
          if (isUnhandled(promise = record.p)) {
            if (isNode) {
              process.emit('unhandledRejection', value, promise);
            } else if (global.console && console.error) {
              console.error('Unhandled promise rejection', value);
            }
          }
          record.a = undefined;
        });
      }, 1);
      notify(record);
    }
    function $resolve(value) {
      var record = this,
          then;
      if (record.d)
        return;
      record.d = true;
      record = record.r || record;
      try {
        if (then = isThenable(value)) {
          asap.call(global, function() {
            var wrapper = {
              r: record,
              d: false
            };
            try {
              then.call(value, ctx($resolve, wrapper, 1), ctx($reject, wrapper, 1));
            } catch (e) {
              $reject.call(wrapper, e);
            }
          });
        } else {
          record.v = value;
          record.s = 1;
          notify(record);
        }
      } catch (e) {
        $reject.call({
          r: record,
          d: false
        }, e);
      }
    }
    if (!useNative) {
      P = function Promise(executor) {
        assertFunction(executor);
        var record = {
          p: assert.inst(this, P, PROMISE),
          c: [],
          a: undefined,
          s: 0,
          d: false,
          v: undefined,
          h: false
        };
        $.hide(this, RECORD, record);
        try {
          executor(ctx($resolve, record, 1), ctx($reject, record, 1));
        } catch (err) {
          $reject.call(record, err);
        }
      };
      require("npm:core-js@0.9.18/library/modules/$.mix.js")(P.prototype, {
        then: function then(onFulfilled, onRejected) {
          var S = assertObject(assertObject(this).constructor)[SPECIES];
          var react = {
            ok: isFunction(onFulfilled) ? onFulfilled : true,
            fail: isFunction(onRejected) ? onRejected : false
          };
          var promise = react.P = new (S != undefined ? S : P)(function(res, rej) {
            react.res = assertFunction(res);
            react.rej = assertFunction(rej);
          });
          var record = this[RECORD];
          record.c.push(react);
          if (record.a)
            record.a.push(react);
          if (record.s)
            notify(record);
          return promise;
        },
        'catch': function(onRejected) {
          return this.then(undefined, onRejected);
        }
      });
    }
    $def($def.G + $def.W + $def.F * !useNative, {Promise: P});
    cof.set(P, PROMISE);
    species(P);
    species(Wrapper = $.core[PROMISE]);
    $def($def.S + $def.F * !useNative, PROMISE, {reject: function reject(r) {
        return new (getConstructor(this))(function(res, rej) {
          rej(r);
        });
      }});
    $def($def.S + $def.F * (!useNative || testResolve(true)), PROMISE, {resolve: function resolve(x) {
        return isPromise(x) && sameConstructor(x.constructor, this) ? x : new this(function(res) {
          res(x);
        });
      }});
    $def($def.S + $def.F * !(useNative && require("npm:core-js@0.9.18/library/modules/$.iter-detect.js")(function(iter) {
      P.all(iter)['catch'](function() {});
    })), PROMISE, {
      all: function all(iterable) {
        var C = getConstructor(this),
            values = [];
        return new C(function(res, rej) {
          forOf(iterable, false, values.push, values);
          var remaining = values.length,
              results = Array(remaining);
          if (remaining)
            $.each.call(values, function(promise, index) {
              C.resolve(promise).then(function(value) {
                results[index] = value;
                --remaining || res(results);
              }, rej);
            });
          else
            res(results);
        });
      },
      race: function race(iterable) {
        var C = getConstructor(this);
        return new C(function(res, rej) {
          forOf(iterable, false, function(promise) {
            C.resolve(promise).then(res, rej);
          });
        });
      }
    });
  })(require("github:jspm/nodelibs-process@0.1.2.js"));
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/fn/reflect/own-keys.js", ["npm:core-js@0.9.18/library/modules/es6.reflect.js", "npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.18/library/modules/es6.reflect.js");
  module.exports = require("npm:core-js@0.9.18/library/modules/$.js").core.Reflect.ownKeys;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/fn/object/get-own-property-symbols.js", ["npm:core-js@0.9.18/library/modules/es6.symbol.js", "npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.18/library/modules/es6.symbol.js");
  module.exports = require("npm:core-js@0.9.18/library/modules/$.js").core.Object.getOwnPropertySymbols;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/core-js/object/define-property.js", ["npm:core-js@0.9.18/library/fn/object/define-property.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/object/define-property.js"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/core-js/object/get-own-property-descriptor.js", ["npm:core-js@0.9.18/library/fn/object/get-own-property-descriptor.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/object/get-own-property-descriptor.js"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/fn/object/set-prototype-of.js", ["npm:core-js@0.9.18/library/modules/es6.object.set-prototype-of.js", "npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.18/library/modules/es6.object.set-prototype-of.js");
  module.exports = require("npm:core-js@0.9.18/library/modules/$.js").core.Object.setPrototypeOf;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/$.iter.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.cof.js", "npm:core-js@0.9.18/library/modules/$.assert.js", "npm:core-js@0.9.18/library/modules/$.wks.js", "npm:core-js@0.9.18/library/modules/$.shared.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      cof = require("npm:core-js@0.9.18/library/modules/$.cof.js"),
      classof = cof.classof,
      assert = require("npm:core-js@0.9.18/library/modules/$.assert.js"),
      assertObject = assert.obj,
      SYMBOL_ITERATOR = require("npm:core-js@0.9.18/library/modules/$.wks.js")('iterator'),
      FF_ITERATOR = '@@iterator',
      Iterators = require("npm:core-js@0.9.18/library/modules/$.shared.js")('iterators'),
      IteratorPrototype = {};
  setIterator(IteratorPrototype, $.that);
  function setIterator(O, value) {
    $.hide(O, SYMBOL_ITERATOR, value);
    if (FF_ITERATOR in [])
      $.hide(O, FF_ITERATOR, value);
  }
  module.exports = {
    BUGGY: 'keys' in [] && !('next' in [].keys()),
    Iterators: Iterators,
    step: function(done, value) {
      return {
        value: value,
        done: !!done
      };
    },
    is: function(it) {
      var O = Object(it),
          Symbol = $.g.Symbol;
      return (Symbol && Symbol.iterator || FF_ITERATOR) in O || SYMBOL_ITERATOR in O || $.has(Iterators, classof(O));
    },
    get: function(it) {
      var Symbol = $.g.Symbol,
          getIter;
      if (it != undefined) {
        getIter = it[Symbol && Symbol.iterator || FF_ITERATOR] || it[SYMBOL_ITERATOR] || Iterators[classof(it)];
      }
      assert($.isFunction(getIter), it, ' is not iterable!');
      return assertObject(getIter.call(it));
    },
    set: setIterator,
    create: function(Constructor, NAME, next, proto) {
      Constructor.prototype = $.create(proto || IteratorPrototype, {next: $.desc(1, next)});
      cof.set(Constructor, NAME + ' Iterator');
    }
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("github:jspm/nodelibs-process@0.1.2.js", ["github:jspm/nodelibs-process@0.1.2/index.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = require("github:jspm/nodelibs-process@0.1.2/index.js");
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/es6.map.js", ["npm:core-js@0.9.18/library/modules/$.collection-strong.js", "npm:core-js@0.9.18/library/modules/$.collection.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var strong = require("npm:core-js@0.9.18/library/modules/$.collection-strong.js");
  require("npm:core-js@0.9.18/library/modules/$.collection.js")('Map', function(get) {
    return function Map() {
      return get(this, arguments[0]);
    };
  }, {
    get: function get(key) {
      var entry = strong.getEntry(this, key);
      return entry && entry.v;
    },
    set: function set(key, value) {
      return strong.def(this, key === 0 ? 0 : key, value);
    }
  }, strong, true);
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/fn/promise.js", ["npm:core-js@0.9.18/library/modules/es6.object.to-string.js", "npm:core-js@0.9.18/library/modules/es6.string.iterator.js", "npm:core-js@0.9.18/library/modules/web.dom.iterable.js", "npm:core-js@0.9.18/library/modules/es6.promise.js", "npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.18/library/modules/es6.object.to-string.js");
  require("npm:core-js@0.9.18/library/modules/es6.string.iterator.js");
  require("npm:core-js@0.9.18/library/modules/web.dom.iterable.js");
  require("npm:core-js@0.9.18/library/modules/es6.promise.js");
  module.exports = require("npm:core-js@0.9.18/library/modules/$.js").core.Promise;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/core-js/reflect/own-keys.js", ["npm:core-js@0.9.18/library/fn/reflect/own-keys.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/reflect/own-keys.js"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/core-js/object/get-own-property-symbols.js", ["npm:core-js@0.9.18/library/fn/object/get-own-property-symbols.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/object/get-own-property-symbols.js"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/helpers/create-class.js", ["npm:babel-runtime@5.8.25/core-js/object/define-property.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var _Object$defineProperty = require("npm:babel-runtime@5.8.25/core-js/object/define-property.js")["default"];
  exports["default"] = (function() {
    function defineProperties(target, props) {
      for (var i = 0; i < props.length; i++) {
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor)
          descriptor.writable = true;
        _Object$defineProperty(target, descriptor.key, descriptor);
      }
    }
    return function(Constructor, protoProps, staticProps) {
      if (protoProps)
        defineProperties(Constructor.prototype, protoProps);
      if (staticProps)
        defineProperties(Constructor, staticProps);
      return Constructor;
    };
  })();
  exports.__esModule = true;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/helpers/get.js", ["npm:babel-runtime@5.8.25/core-js/object/get-own-property-descriptor.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var _Object$getOwnPropertyDescriptor = require("npm:babel-runtime@5.8.25/core-js/object/get-own-property-descriptor.js")["default"];
  exports["default"] = function get(_x, _x2, _x3) {
    var _again = true;
    _function: while (_again) {
      var object = _x,
          property = _x2,
          receiver = _x3;
      desc = parent = getter = undefined;
      _again = false;
      if (object === null)
        object = Function.prototype;
      var desc = _Object$getOwnPropertyDescriptor(object, property);
      if (desc === undefined) {
        var parent = Object.getPrototypeOf(object);
        if (parent === null) {
          return undefined;
        } else {
          _x = parent;
          _x2 = property;
          _x3 = receiver;
          _again = true;
          continue _function;
        }
      } else if ("value" in desc) {
        return desc.value;
      } else {
        var getter = desc.get;
        if (getter === undefined) {
          return undefined;
        }
        return getter.call(receiver);
      }
    }
  };
  exports.__esModule = true;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/core-js/object/set-prototype-of.js", ["npm:core-js@0.9.18/library/fn/object/set-prototype-of.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/object/set-prototype-of.js"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/es6.array.iterator.js", ["npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.unscope.js", "npm:core-js@0.9.18/library/modules/$.uid.js", "npm:core-js@0.9.18/library/modules/$.iter.js", "npm:core-js@0.9.18/library/modules/$.iter-define.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      setUnscope = require("npm:core-js@0.9.18/library/modules/$.unscope.js"),
      ITER = require("npm:core-js@0.9.18/library/modules/$.uid.js").safe('iter'),
      $iter = require("npm:core-js@0.9.18/library/modules/$.iter.js"),
      step = $iter.step,
      Iterators = $iter.Iterators;
  require("npm:core-js@0.9.18/library/modules/$.iter-define.js")(Array, 'Array', function(iterated, kind) {
    $.set(this, ITER, {
      o: $.toObject(iterated),
      i: 0,
      k: kind
    });
  }, function() {
    var iter = this[ITER],
        O = iter.o,
        kind = iter.k,
        index = iter.i++;
    if (!O || index >= O.length) {
      iter.o = undefined;
      return step(1);
    }
    if (kind == 'keys')
      return step(0, index);
    if (kind == 'values')
      return step(0, O[index]);
    return step(0, [index, O[index]]);
  }, 'values');
  Iterators.Arguments = Iterators.Array;
  setUnscope('keys');
  setUnscope('values');
  setUnscope('entries');
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:lodash@3.10.1/index.js", ["github:jspm/nodelibs-process@0.1.2.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  "format cjs";
  (function(process) {
    ;
    (function() {
      var undefined;
      var VERSION = '3.10.1';
      var BIND_FLAG = 1,
          BIND_KEY_FLAG = 2,
          CURRY_BOUND_FLAG = 4,
          CURRY_FLAG = 8,
          CURRY_RIGHT_FLAG = 16,
          PARTIAL_FLAG = 32,
          PARTIAL_RIGHT_FLAG = 64,
          ARY_FLAG = 128,
          REARG_FLAG = 256;
      var DEFAULT_TRUNC_LENGTH = 30,
          DEFAULT_TRUNC_OMISSION = '...';
      var HOT_COUNT = 150,
          HOT_SPAN = 16;
      var LARGE_ARRAY_SIZE = 200;
      var LAZY_FILTER_FLAG = 1,
          LAZY_MAP_FLAG = 2;
      var FUNC_ERROR_TEXT = 'Expected a function';
      var PLACEHOLDER = '__lodash_placeholder__';
      var argsTag = '[object Arguments]',
          arrayTag = '[object Array]',
          boolTag = '[object Boolean]',
          dateTag = '[object Date]',
          errorTag = '[object Error]',
          funcTag = '[object Function]',
          mapTag = '[object Map]',
          numberTag = '[object Number]',
          objectTag = '[object Object]',
          regexpTag = '[object RegExp]',
          setTag = '[object Set]',
          stringTag = '[object String]',
          weakMapTag = '[object WeakMap]';
      var arrayBufferTag = '[object ArrayBuffer]',
          float32Tag = '[object Float32Array]',
          float64Tag = '[object Float64Array]',
          int8Tag = '[object Int8Array]',
          int16Tag = '[object Int16Array]',
          int32Tag = '[object Int32Array]',
          uint8Tag = '[object Uint8Array]',
          uint8ClampedTag = '[object Uint8ClampedArray]',
          uint16Tag = '[object Uint16Array]',
          uint32Tag = '[object Uint32Array]';
      var reEmptyStringLeading = /\b__p \+= '';/g,
          reEmptyStringMiddle = /\b(__p \+=) '' \+/g,
          reEmptyStringTrailing = /(__e\(.*?\)|\b__t\)) \+\n'';/g;
      var reEscapedHtml = /&(?:amp|lt|gt|quot|#39|#96);/g,
          reUnescapedHtml = /[&<>"'`]/g,
          reHasEscapedHtml = RegExp(reEscapedHtml.source),
          reHasUnescapedHtml = RegExp(reUnescapedHtml.source);
      var reEscape = /<%-([\s\S]+?)%>/g,
          reEvaluate = /<%([\s\S]+?)%>/g,
          reInterpolate = /<%=([\s\S]+?)%>/g;
      var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\n\\]|\\.)*?\1)\]/,
          reIsPlainProp = /^\w*$/,
          rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\n\\]|\\.)*?)\2)\]/g;
      var reRegExpChars = /^[:!,]|[\\^$.*+?()[\]{}|\/]|(^[0-9a-fA-Fnrtuvx])|([\n\r\u2028\u2029])/g,
          reHasRegExpChars = RegExp(reRegExpChars.source);
      var reComboMark = /[\u0300-\u036f\ufe20-\ufe23]/g;
      var reEscapeChar = /\\(\\)?/g;
      var reEsTemplate = /\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g;
      var reFlags = /\w*$/;
      var reHasHexPrefix = /^0[xX]/;
      var reIsHostCtor = /^\[object .+?Constructor\]$/;
      var reIsUint = /^\d+$/;
      var reLatin1 = /[\xc0-\xd6\xd8-\xde\xdf-\xf6\xf8-\xff]/g;
      var reNoMatch = /($^)/;
      var reUnescapedString = /['\n\r\u2028\u2029\\]/g;
      var reWords = (function() {
        var upper = '[A-Z\\xc0-\\xd6\\xd8-\\xde]',
            lower = '[a-z\\xdf-\\xf6\\xf8-\\xff]+';
        return RegExp(upper + '+(?=' + upper + lower + ')|' + upper + '?' + lower + '|' + upper + '+|[0-9]+', 'g');
      }());
      var contextProps = ['Array', 'ArrayBuffer', 'Date', 'Error', 'Float32Array', 'Float64Array', 'Function', 'Int8Array', 'Int16Array', 'Int32Array', 'Math', 'Number', 'Object', 'RegExp', 'Set', 'String', '_', 'clearTimeout', 'isFinite', 'parseFloat', 'parseInt', 'setTimeout', 'TypeError', 'Uint8Array', 'Uint8ClampedArray', 'Uint16Array', 'Uint32Array', 'WeakMap'];
      var templateCounter = -1;
      var typedArrayTags = {};
      typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
      typedArrayTags[argsTag] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;
      var cloneableTags = {};
      cloneableTags[argsTag] = cloneableTags[arrayTag] = cloneableTags[arrayBufferTag] = cloneableTags[boolTag] = cloneableTags[dateTag] = cloneableTags[float32Tag] = cloneableTags[float64Tag] = cloneableTags[int8Tag] = cloneableTags[int16Tag] = cloneableTags[int32Tag] = cloneableTags[numberTag] = cloneableTags[objectTag] = cloneableTags[regexpTag] = cloneableTags[stringTag] = cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] = cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
      cloneableTags[errorTag] = cloneableTags[funcTag] = cloneableTags[mapTag] = cloneableTags[setTag] = cloneableTags[weakMapTag] = false;
      var deburredLetters = {
        '\xc0': 'A',
        '\xc1': 'A',
        '\xc2': 'A',
        '\xc3': 'A',
        '\xc4': 'A',
        '\xc5': 'A',
        '\xe0': 'a',
        '\xe1': 'a',
        '\xe2': 'a',
        '\xe3': 'a',
        '\xe4': 'a',
        '\xe5': 'a',
        '\xc7': 'C',
        '\xe7': 'c',
        '\xd0': 'D',
        '\xf0': 'd',
        '\xc8': 'E',
        '\xc9': 'E',
        '\xca': 'E',
        '\xcb': 'E',
        '\xe8': 'e',
        '\xe9': 'e',
        '\xea': 'e',
        '\xeb': 'e',
        '\xcC': 'I',
        '\xcd': 'I',
        '\xce': 'I',
        '\xcf': 'I',
        '\xeC': 'i',
        '\xed': 'i',
        '\xee': 'i',
        '\xef': 'i',
        '\xd1': 'N',
        '\xf1': 'n',
        '\xd2': 'O',
        '\xd3': 'O',
        '\xd4': 'O',
        '\xd5': 'O',
        '\xd6': 'O',
        '\xd8': 'O',
        '\xf2': 'o',
        '\xf3': 'o',
        '\xf4': 'o',
        '\xf5': 'o',
        '\xf6': 'o',
        '\xf8': 'o',
        '\xd9': 'U',
        '\xda': 'U',
        '\xdb': 'U',
        '\xdc': 'U',
        '\xf9': 'u',
        '\xfa': 'u',
        '\xfb': 'u',
        '\xfc': 'u',
        '\xdd': 'Y',
        '\xfd': 'y',
        '\xff': 'y',
        '\xc6': 'Ae',
        '\xe6': 'ae',
        '\xde': 'Th',
        '\xfe': 'th',
        '\xdf': 'ss'
      };
      var htmlEscapes = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '`': '&#96;'
      };
      var htmlUnescapes = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&#96;': '`'
      };
      var objectTypes = {
        'function': true,
        'object': true
      };
      var regexpEscapes = {
        '0': 'x30',
        '1': 'x31',
        '2': 'x32',
        '3': 'x33',
        '4': 'x34',
        '5': 'x35',
        '6': 'x36',
        '7': 'x37',
        '8': 'x38',
        '9': 'x39',
        'A': 'x41',
        'B': 'x42',
        'C': 'x43',
        'D': 'x44',
        'E': 'x45',
        'F': 'x46',
        'a': 'x61',
        'b': 'x62',
        'c': 'x63',
        'd': 'x64',
        'e': 'x65',
        'f': 'x66',
        'n': 'x6e',
        'r': 'x72',
        't': 'x74',
        'u': 'x75',
        'v': 'x76',
        'x': 'x78'
      };
      var stringEscapes = {
        '\\': '\\',
        "'": "'",
        '\n': 'n',
        '\r': 'r',
        '\u2028': 'u2028',
        '\u2029': 'u2029'
      };
      var freeExports = objectTypes[typeof exports] && exports && !exports.nodeType && exports;
      var freeModule = objectTypes[typeof module] && module && !module.nodeType && module;
      var freeGlobal = freeExports && freeModule && typeof global == 'object' && global && global.Object && global;
      var freeSelf = objectTypes[typeof self] && self && self.Object && self;
      var freeWindow = objectTypes[typeof window] && window && window.Object && window;
      var moduleExports = freeModule && freeModule.exports === freeExports && freeExports;
      var root = freeGlobal || ((freeWindow !== (this && this.window)) && freeWindow) || freeSelf || this;
      function baseCompareAscending(value, other) {
        if (value !== other) {
          var valIsNull = value === null,
              valIsUndef = value === undefined,
              valIsReflexive = value === value;
          var othIsNull = other === null,
              othIsUndef = other === undefined,
              othIsReflexive = other === other;
          if ((value > other && !othIsNull) || !valIsReflexive || (valIsNull && !othIsUndef && othIsReflexive) || (valIsUndef && othIsReflexive)) {
            return 1;
          }
          if ((value < other && !valIsNull) || !othIsReflexive || (othIsNull && !valIsUndef && valIsReflexive) || (othIsUndef && valIsReflexive)) {
            return -1;
          }
        }
        return 0;
      }
      function baseFindIndex(array, predicate, fromRight) {
        var length = array.length,
            index = fromRight ? length : -1;
        while ((fromRight ? index-- : ++index < length)) {
          if (predicate(array[index], index, array)) {
            return index;
          }
        }
        return -1;
      }
      function baseIndexOf(array, value, fromIndex) {
        if (value !== value) {
          return indexOfNaN(array, fromIndex);
        }
        var index = fromIndex - 1,
            length = array.length;
        while (++index < length) {
          if (array[index] === value) {
            return index;
          }
        }
        return -1;
      }
      function baseIsFunction(value) {
        return typeof value == 'function' || false;
      }
      function baseToString(value) {
        return value == null ? '' : (value + '');
      }
      function charsLeftIndex(string, chars) {
        var index = -1,
            length = string.length;
        while (++index < length && chars.indexOf(string.charAt(index)) > -1) {}
        return index;
      }
      function charsRightIndex(string, chars) {
        var index = string.length;
        while (index-- && chars.indexOf(string.charAt(index)) > -1) {}
        return index;
      }
      function compareAscending(object, other) {
        return baseCompareAscending(object.criteria, other.criteria) || (object.index - other.index);
      }
      function compareMultiple(object, other, orders) {
        var index = -1,
            objCriteria = object.criteria,
            othCriteria = other.criteria,
            length = objCriteria.length,
            ordersLength = orders.length;
        while (++index < length) {
          var result = baseCompareAscending(objCriteria[index], othCriteria[index]);
          if (result) {
            if (index >= ordersLength) {
              return result;
            }
            var order = orders[index];
            return result * ((order === 'asc' || order === true) ? 1 : -1);
          }
        }
        return object.index - other.index;
      }
      function deburrLetter(letter) {
        return deburredLetters[letter];
      }
      function escapeHtmlChar(chr) {
        return htmlEscapes[chr];
      }
      function escapeRegExpChar(chr, leadingChar, whitespaceChar) {
        if (leadingChar) {
          chr = regexpEscapes[chr];
        } else if (whitespaceChar) {
          chr = stringEscapes[chr];
        }
        return '\\' + chr;
      }
      function escapeStringChar(chr) {
        return '\\' + stringEscapes[chr];
      }
      function indexOfNaN(array, fromIndex, fromRight) {
        var length = array.length,
            index = fromIndex + (fromRight ? 0 : -1);
        while ((fromRight ? index-- : ++index < length)) {
          var other = array[index];
          if (other !== other) {
            return index;
          }
        }
        return -1;
      }
      function isObjectLike(value) {
        return !!value && typeof value == 'object';
      }
      function isSpace(charCode) {
        return ((charCode <= 160 && (charCode >= 9 && charCode <= 13) || charCode == 32 || charCode == 160) || charCode == 5760 || charCode == 6158 || (charCode >= 8192 && (charCode <= 8202 || charCode == 8232 || charCode == 8233 || charCode == 8239 || charCode == 8287 || charCode == 12288 || charCode == 65279)));
      }
      function replaceHolders(array, placeholder) {
        var index = -1,
            length = array.length,
            resIndex = -1,
            result = [];
        while (++index < length) {
          if (array[index] === placeholder) {
            array[index] = PLACEHOLDER;
            result[++resIndex] = index;
          }
        }
        return result;
      }
      function sortedUniq(array, iteratee) {
        var seen,
            index = -1,
            length = array.length,
            resIndex = -1,
            result = [];
        while (++index < length) {
          var value = array[index],
              computed = iteratee ? iteratee(value, index, array) : value;
          if (!index || seen !== computed) {
            seen = computed;
            result[++resIndex] = value;
          }
        }
        return result;
      }
      function trimmedLeftIndex(string) {
        var index = -1,
            length = string.length;
        while (++index < length && isSpace(string.charCodeAt(index))) {}
        return index;
      }
      function trimmedRightIndex(string) {
        var index = string.length;
        while (index-- && isSpace(string.charCodeAt(index))) {}
        return index;
      }
      function unescapeHtmlChar(chr) {
        return htmlUnescapes[chr];
      }
      function runInContext(context) {
        context = context ? _.defaults(root.Object(), context, _.pick(root, contextProps)) : root;
        var Array = context.Array,
            Date = context.Date,
            Error = context.Error,
            Function = context.Function,
            Math = context.Math,
            Number = context.Number,
            Object = context.Object,
            RegExp = context.RegExp,
            String = context.String,
            TypeError = context.TypeError;
        var arrayProto = Array.prototype,
            objectProto = Object.prototype,
            stringProto = String.prototype;
        var fnToString = Function.prototype.toString;
        var hasOwnProperty = objectProto.hasOwnProperty;
        var idCounter = 0;
        var objToString = objectProto.toString;
        var oldDash = root._;
        var reIsNative = RegExp('^' + fnToString.call(hasOwnProperty).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&').replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$');
        var ArrayBuffer = context.ArrayBuffer,
            clearTimeout = context.clearTimeout,
            parseFloat = context.parseFloat,
            pow = Math.pow,
            propertyIsEnumerable = objectProto.propertyIsEnumerable,
            Set = getNative(context, 'Set'),
            setTimeout = context.setTimeout,
            splice = arrayProto.splice,
            Uint8Array = context.Uint8Array,
            WeakMap = getNative(context, 'WeakMap');
        var nativeCeil = Math.ceil,
            nativeCreate = getNative(Object, 'create'),
            nativeFloor = Math.floor,
            nativeIsArray = getNative(Array, 'isArray'),
            nativeIsFinite = context.isFinite,
            nativeKeys = getNative(Object, 'keys'),
            nativeMax = Math.max,
            nativeMin = Math.min,
            nativeNow = getNative(Date, 'now'),
            nativeParseInt = context.parseInt,
            nativeRandom = Math.random;
        var NEGATIVE_INFINITY = Number.NEGATIVE_INFINITY,
            POSITIVE_INFINITY = Number.POSITIVE_INFINITY;
        var MAX_ARRAY_LENGTH = 4294967295,
            MAX_ARRAY_INDEX = MAX_ARRAY_LENGTH - 1,
            HALF_MAX_ARRAY_LENGTH = MAX_ARRAY_LENGTH >>> 1;
        var MAX_SAFE_INTEGER = 9007199254740991;
        var metaMap = WeakMap && new WeakMap;
        var realNames = {};
        function lodash(value) {
          if (isObjectLike(value) && !isArray(value) && !(value instanceof LazyWrapper)) {
            if (value instanceof LodashWrapper) {
              return value;
            }
            if (hasOwnProperty.call(value, '__chain__') && hasOwnProperty.call(value, '__wrapped__')) {
              return wrapperClone(value);
            }
          }
          return new LodashWrapper(value);
        }
        function baseLodash() {}
        function LodashWrapper(value, chainAll, actions) {
          this.__wrapped__ = value;
          this.__actions__ = actions || [];
          this.__chain__ = !!chainAll;
        }
        var support = lodash.support = {};
        lodash.templateSettings = {
          'escape': reEscape,
          'evaluate': reEvaluate,
          'interpolate': reInterpolate,
          'variable': '',
          'imports': {'_': lodash}
        };
        function LazyWrapper(value) {
          this.__wrapped__ = value;
          this.__actions__ = [];
          this.__dir__ = 1;
          this.__filtered__ = false;
          this.__iteratees__ = [];
          this.__takeCount__ = POSITIVE_INFINITY;
          this.__views__ = [];
        }
        function lazyClone() {
          var result = new LazyWrapper(this.__wrapped__);
          result.__actions__ = arrayCopy(this.__actions__);
          result.__dir__ = this.__dir__;
          result.__filtered__ = this.__filtered__;
          result.__iteratees__ = arrayCopy(this.__iteratees__);
          result.__takeCount__ = this.__takeCount__;
          result.__views__ = arrayCopy(this.__views__);
          return result;
        }
        function lazyReverse() {
          if (this.__filtered__) {
            var result = new LazyWrapper(this);
            result.__dir__ = -1;
            result.__filtered__ = true;
          } else {
            result = this.clone();
            result.__dir__ *= -1;
          }
          return result;
        }
        function lazyValue() {
          var array = this.__wrapped__.value(),
              dir = this.__dir__,
              isArr = isArray(array),
              isRight = dir < 0,
              arrLength = isArr ? array.length : 0,
              view = getView(0, arrLength, this.__views__),
              start = view.start,
              end = view.end,
              length = end - start,
              index = isRight ? end : (start - 1),
              iteratees = this.__iteratees__,
              iterLength = iteratees.length,
              resIndex = 0,
              takeCount = nativeMin(length, this.__takeCount__);
          if (!isArr || arrLength < LARGE_ARRAY_SIZE || (arrLength == length && takeCount == length)) {
            return baseWrapperValue((isRight && isArr) ? array.reverse() : array, this.__actions__);
          }
          var result = [];
          outer: while (length-- && resIndex < takeCount) {
            index += dir;
            var iterIndex = -1,
                value = array[index];
            while (++iterIndex < iterLength) {
              var data = iteratees[iterIndex],
                  iteratee = data.iteratee,
                  type = data.type,
                  computed = iteratee(value);
              if (type == LAZY_MAP_FLAG) {
                value = computed;
              } else if (!computed) {
                if (type == LAZY_FILTER_FLAG) {
                  continue outer;
                } else {
                  break outer;
                }
              }
            }
            result[resIndex++] = value;
          }
          return result;
        }
        function MapCache() {
          this.__data__ = {};
        }
        function mapDelete(key) {
          return this.has(key) && delete this.__data__[key];
        }
        function mapGet(key) {
          return key == '__proto__' ? undefined : this.__data__[key];
        }
        function mapHas(key) {
          return key != '__proto__' && hasOwnProperty.call(this.__data__, key);
        }
        function mapSet(key, value) {
          if (key != '__proto__') {
            this.__data__[key] = value;
          }
          return this;
        }
        function SetCache(values) {
          var length = values ? values.length : 0;
          this.data = {
            'hash': nativeCreate(null),
            'set': new Set
          };
          while (length--) {
            this.push(values[length]);
          }
        }
        function cacheIndexOf(cache, value) {
          var data = cache.data,
              result = (typeof value == 'string' || isObject(value)) ? data.set.has(value) : data.hash[value];
          return result ? 0 : -1;
        }
        function cachePush(value) {
          var data = this.data;
          if (typeof value == 'string' || isObject(value)) {
            data.set.add(value);
          } else {
            data.hash[value] = true;
          }
        }
        function arrayConcat(array, other) {
          var index = -1,
              length = array.length,
              othIndex = -1,
              othLength = other.length,
              result = Array(length + othLength);
          while (++index < length) {
            result[index] = array[index];
          }
          while (++othIndex < othLength) {
            result[index++] = other[othIndex];
          }
          return result;
        }
        function arrayCopy(source, array) {
          var index = -1,
              length = source.length;
          array || (array = Array(length));
          while (++index < length) {
            array[index] = source[index];
          }
          return array;
        }
        function arrayEach(array, iteratee) {
          var index = -1,
              length = array.length;
          while (++index < length) {
            if (iteratee(array[index], index, array) === false) {
              break;
            }
          }
          return array;
        }
        function arrayEachRight(array, iteratee) {
          var length = array.length;
          while (length--) {
            if (iteratee(array[length], length, array) === false) {
              break;
            }
          }
          return array;
        }
        function arrayEvery(array, predicate) {
          var index = -1,
              length = array.length;
          while (++index < length) {
            if (!predicate(array[index], index, array)) {
              return false;
            }
          }
          return true;
        }
        function arrayExtremum(array, iteratee, comparator, exValue) {
          var index = -1,
              length = array.length,
              computed = exValue,
              result = computed;
          while (++index < length) {
            var value = array[index],
                current = +iteratee(value);
            if (comparator(current, computed)) {
              computed = current;
              result = value;
            }
          }
          return result;
        }
        function arrayFilter(array, predicate) {
          var index = -1,
              length = array.length,
              resIndex = -1,
              result = [];
          while (++index < length) {
            var value = array[index];
            if (predicate(value, index, array)) {
              result[++resIndex] = value;
            }
          }
          return result;
        }
        function arrayMap(array, iteratee) {
          var index = -1,
              length = array.length,
              result = Array(length);
          while (++index < length) {
            result[index] = iteratee(array[index], index, array);
          }
          return result;
        }
        function arrayPush(array, values) {
          var index = -1,
              length = values.length,
              offset = array.length;
          while (++index < length) {
            array[offset + index] = values[index];
          }
          return array;
        }
        function arrayReduce(array, iteratee, accumulator, initFromArray) {
          var index = -1,
              length = array.length;
          if (initFromArray && length) {
            accumulator = array[++index];
          }
          while (++index < length) {
            accumulator = iteratee(accumulator, array[index], index, array);
          }
          return accumulator;
        }
        function arrayReduceRight(array, iteratee, accumulator, initFromArray) {
          var length = array.length;
          if (initFromArray && length) {
            accumulator = array[--length];
          }
          while (length--) {
            accumulator = iteratee(accumulator, array[length], length, array);
          }
          return accumulator;
        }
        function arraySome(array, predicate) {
          var index = -1,
              length = array.length;
          while (++index < length) {
            if (predicate(array[index], index, array)) {
              return true;
            }
          }
          return false;
        }
        function arraySum(array, iteratee) {
          var length = array.length,
              result = 0;
          while (length--) {
            result += +iteratee(array[length]) || 0;
          }
          return result;
        }
        function assignDefaults(objectValue, sourceValue) {
          return objectValue === undefined ? sourceValue : objectValue;
        }
        function assignOwnDefaults(objectValue, sourceValue, key, object) {
          return (objectValue === undefined || !hasOwnProperty.call(object, key)) ? sourceValue : objectValue;
        }
        function assignWith(object, source, customizer) {
          var index = -1,
              props = keys(source),
              length = props.length;
          while (++index < length) {
            var key = props[index],
                value = object[key],
                result = customizer(value, source[key], key, object, source);
            if ((result === result ? (result !== value) : (value === value)) || (value === undefined && !(key in object))) {
              object[key] = result;
            }
          }
          return object;
        }
        function baseAssign(object, source) {
          return source == null ? object : baseCopy(source, keys(source), object);
        }
        function baseAt(collection, props) {
          var index = -1,
              isNil = collection == null,
              isArr = !isNil && isArrayLike(collection),
              length = isArr ? collection.length : 0,
              propsLength = props.length,
              result = Array(propsLength);
          while (++index < propsLength) {
            var key = props[index];
            if (isArr) {
              result[index] = isIndex(key, length) ? collection[key] : undefined;
            } else {
              result[index] = isNil ? undefined : collection[key];
            }
          }
          return result;
        }
        function baseCopy(source, props, object) {
          object || (object = {});
          var index = -1,
              length = props.length;
          while (++index < length) {
            var key = props[index];
            object[key] = source[key];
          }
          return object;
        }
        function baseCallback(func, thisArg, argCount) {
          var type = typeof func;
          if (type == 'function') {
            return thisArg === undefined ? func : bindCallback(func, thisArg, argCount);
          }
          if (func == null) {
            return identity;
          }
          if (type == 'object') {
            return baseMatches(func);
          }
          return thisArg === undefined ? property(func) : baseMatchesProperty(func, thisArg);
        }
        function baseClone(value, isDeep, customizer, key, object, stackA, stackB) {
          var result;
          if (customizer) {
            result = object ? customizer(value, key, object) : customizer(value);
          }
          if (result !== undefined) {
            return result;
          }
          if (!isObject(value)) {
            return value;
          }
          var isArr = isArray(value);
          if (isArr) {
            result = initCloneArray(value);
            if (!isDeep) {
              return arrayCopy(value, result);
            }
          } else {
            var tag = objToString.call(value),
                isFunc = tag == funcTag;
            if (tag == objectTag || tag == argsTag || (isFunc && !object)) {
              result = initCloneObject(isFunc ? {} : value);
              if (!isDeep) {
                return baseAssign(result, value);
              }
            } else {
              return cloneableTags[tag] ? initCloneByTag(value, tag, isDeep) : (object ? value : {});
            }
          }
          stackA || (stackA = []);
          stackB || (stackB = []);
          var length = stackA.length;
          while (length--) {
            if (stackA[length] == value) {
              return stackB[length];
            }
          }
          stackA.push(value);
          stackB.push(result);
          (isArr ? arrayEach : baseForOwn)(value, function(subValue, key) {
            result[key] = baseClone(subValue, isDeep, customizer, key, value, stackA, stackB);
          });
          return result;
        }
        var baseCreate = (function() {
          function object() {}
          return function(prototype) {
            if (isObject(prototype)) {
              object.prototype = prototype;
              var result = new object;
              object.prototype = undefined;
            }
            return result || {};
          };
        }());
        function baseDelay(func, wait, args) {
          if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          return setTimeout(function() {
            func.apply(undefined, args);
          }, wait);
        }
        function baseDifference(array, values) {
          var length = array ? array.length : 0,
              result = [];
          if (!length) {
            return result;
          }
          var index = -1,
              indexOf = getIndexOf(),
              isCommon = indexOf == baseIndexOf,
              cache = (isCommon && values.length >= LARGE_ARRAY_SIZE) ? createCache(values) : null,
              valuesLength = values.length;
          if (cache) {
            indexOf = cacheIndexOf;
            isCommon = false;
            values = cache;
          }
          outer: while (++index < length) {
            var value = array[index];
            if (isCommon && value === value) {
              var valuesIndex = valuesLength;
              while (valuesIndex--) {
                if (values[valuesIndex] === value) {
                  continue outer;
                }
              }
              result.push(value);
            } else if (indexOf(values, value, 0) < 0) {
              result.push(value);
            }
          }
          return result;
        }
        var baseEach = createBaseEach(baseForOwn);
        var baseEachRight = createBaseEach(baseForOwnRight, true);
        function baseEvery(collection, predicate) {
          var result = true;
          baseEach(collection, function(value, index, collection) {
            result = !!predicate(value, index, collection);
            return result;
          });
          return result;
        }
        function baseExtremum(collection, iteratee, comparator, exValue) {
          var computed = exValue,
              result = computed;
          baseEach(collection, function(value, index, collection) {
            var current = +iteratee(value, index, collection);
            if (comparator(current, computed) || (current === exValue && current === result)) {
              computed = current;
              result = value;
            }
          });
          return result;
        }
        function baseFill(array, value, start, end) {
          var length = array.length;
          start = start == null ? 0 : (+start || 0);
          if (start < 0) {
            start = -start > length ? 0 : (length + start);
          }
          end = (end === undefined || end > length) ? length : (+end || 0);
          if (end < 0) {
            end += length;
          }
          length = start > end ? 0 : (end >>> 0);
          start >>>= 0;
          while (start < length) {
            array[start++] = value;
          }
          return array;
        }
        function baseFilter(collection, predicate) {
          var result = [];
          baseEach(collection, function(value, index, collection) {
            if (predicate(value, index, collection)) {
              result.push(value);
            }
          });
          return result;
        }
        function baseFind(collection, predicate, eachFunc, retKey) {
          var result;
          eachFunc(collection, function(value, key, collection) {
            if (predicate(value, key, collection)) {
              result = retKey ? key : value;
              return false;
            }
          });
          return result;
        }
        function baseFlatten(array, isDeep, isStrict, result) {
          result || (result = []);
          var index = -1,
              length = array.length;
          while (++index < length) {
            var value = array[index];
            if (isObjectLike(value) && isArrayLike(value) && (isStrict || isArray(value) || isArguments(value))) {
              if (isDeep) {
                baseFlatten(value, isDeep, isStrict, result);
              } else {
                arrayPush(result, value);
              }
            } else if (!isStrict) {
              result[result.length] = value;
            }
          }
          return result;
        }
        var baseFor = createBaseFor();
        var baseForRight = createBaseFor(true);
        function baseForIn(object, iteratee) {
          return baseFor(object, iteratee, keysIn);
        }
        function baseForOwn(object, iteratee) {
          return baseFor(object, iteratee, keys);
        }
        function baseForOwnRight(object, iteratee) {
          return baseForRight(object, iteratee, keys);
        }
        function baseFunctions(object, props) {
          var index = -1,
              length = props.length,
              resIndex = -1,
              result = [];
          while (++index < length) {
            var key = props[index];
            if (isFunction(object[key])) {
              result[++resIndex] = key;
            }
          }
          return result;
        }
        function baseGet(object, path, pathKey) {
          if (object == null) {
            return;
          }
          if (pathKey !== undefined && pathKey in toObject(object)) {
            path = [pathKey];
          }
          var index = 0,
              length = path.length;
          while (object != null && index < length) {
            object = object[path[index++]];
          }
          return (index && index == length) ? object : undefined;
        }
        function baseIsEqual(value, other, customizer, isLoose, stackA, stackB) {
          if (value === other) {
            return true;
          }
          if (value == null || other == null || (!isObject(value) && !isObjectLike(other))) {
            return value !== value && other !== other;
          }
          return baseIsEqualDeep(value, other, baseIsEqual, customizer, isLoose, stackA, stackB);
        }
        function baseIsEqualDeep(object, other, equalFunc, customizer, isLoose, stackA, stackB) {
          var objIsArr = isArray(object),
              othIsArr = isArray(other),
              objTag = arrayTag,
              othTag = arrayTag;
          if (!objIsArr) {
            objTag = objToString.call(object);
            if (objTag == argsTag) {
              objTag = objectTag;
            } else if (objTag != objectTag) {
              objIsArr = isTypedArray(object);
            }
          }
          if (!othIsArr) {
            othTag = objToString.call(other);
            if (othTag == argsTag) {
              othTag = objectTag;
            } else if (othTag != objectTag) {
              othIsArr = isTypedArray(other);
            }
          }
          var objIsObj = objTag == objectTag,
              othIsObj = othTag == objectTag,
              isSameTag = objTag == othTag;
          if (isSameTag && !(objIsArr || objIsObj)) {
            return equalByTag(object, other, objTag);
          }
          if (!isLoose) {
            var objIsWrapped = objIsObj && hasOwnProperty.call(object, '__wrapped__'),
                othIsWrapped = othIsObj && hasOwnProperty.call(other, '__wrapped__');
            if (objIsWrapped || othIsWrapped) {
              return equalFunc(objIsWrapped ? object.value() : object, othIsWrapped ? other.value() : other, customizer, isLoose, stackA, stackB);
            }
          }
          if (!isSameTag) {
            return false;
          }
          stackA || (stackA = []);
          stackB || (stackB = []);
          var length = stackA.length;
          while (length--) {
            if (stackA[length] == object) {
              return stackB[length] == other;
            }
          }
          stackA.push(object);
          stackB.push(other);
          var result = (objIsArr ? equalArrays : equalObjects)(object, other, equalFunc, customizer, isLoose, stackA, stackB);
          stackA.pop();
          stackB.pop();
          return result;
        }
        function baseIsMatch(object, matchData, customizer) {
          var index = matchData.length,
              length = index,
              noCustomizer = !customizer;
          if (object == null) {
            return !length;
          }
          object = toObject(object);
          while (index--) {
            var data = matchData[index];
            if ((noCustomizer && data[2]) ? data[1] !== object[data[0]] : !(data[0] in object)) {
              return false;
            }
          }
          while (++index < length) {
            data = matchData[index];
            var key = data[0],
                objValue = object[key],
                srcValue = data[1];
            if (noCustomizer && data[2]) {
              if (objValue === undefined && !(key in object)) {
                return false;
              }
            } else {
              var result = customizer ? customizer(objValue, srcValue, key) : undefined;
              if (!(result === undefined ? baseIsEqual(srcValue, objValue, customizer, true) : result)) {
                return false;
              }
            }
          }
          return true;
        }
        function baseMap(collection, iteratee) {
          var index = -1,
              result = isArrayLike(collection) ? Array(collection.length) : [];
          baseEach(collection, function(value, key, collection) {
            result[++index] = iteratee(value, key, collection);
          });
          return result;
        }
        function baseMatches(source) {
          var matchData = getMatchData(source);
          if (matchData.length == 1 && matchData[0][2]) {
            var key = matchData[0][0],
                value = matchData[0][1];
            return function(object) {
              if (object == null) {
                return false;
              }
              return object[key] === value && (value !== undefined || (key in toObject(object)));
            };
          }
          return function(object) {
            return baseIsMatch(object, matchData);
          };
        }
        function baseMatchesProperty(path, srcValue) {
          var isArr = isArray(path),
              isCommon = isKey(path) && isStrictComparable(srcValue),
              pathKey = (path + '');
          path = toPath(path);
          return function(object) {
            if (object == null) {
              return false;
            }
            var key = pathKey;
            object = toObject(object);
            if ((isArr || !isCommon) && !(key in object)) {
              object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
              if (object == null) {
                return false;
              }
              key = last(path);
              object = toObject(object);
            }
            return object[key] === srcValue ? (srcValue !== undefined || (key in object)) : baseIsEqual(srcValue, object[key], undefined, true);
          };
        }
        function baseMerge(object, source, customizer, stackA, stackB) {
          if (!isObject(object)) {
            return object;
          }
          var isSrcArr = isArrayLike(source) && (isArray(source) || isTypedArray(source)),
              props = isSrcArr ? undefined : keys(source);
          arrayEach(props || source, function(srcValue, key) {
            if (props) {
              key = srcValue;
              srcValue = source[key];
            }
            if (isObjectLike(srcValue)) {
              stackA || (stackA = []);
              stackB || (stackB = []);
              baseMergeDeep(object, source, key, baseMerge, customizer, stackA, stackB);
            } else {
              var value = object[key],
                  result = customizer ? customizer(value, srcValue, key, object, source) : undefined,
                  isCommon = result === undefined;
              if (isCommon) {
                result = srcValue;
              }
              if ((result !== undefined || (isSrcArr && !(key in object))) && (isCommon || (result === result ? (result !== value) : (value === value)))) {
                object[key] = result;
              }
            }
          });
          return object;
        }
        function baseMergeDeep(object, source, key, mergeFunc, customizer, stackA, stackB) {
          var length = stackA.length,
              srcValue = source[key];
          while (length--) {
            if (stackA[length] == srcValue) {
              object[key] = stackB[length];
              return;
            }
          }
          var value = object[key],
              result = customizer ? customizer(value, srcValue, key, object, source) : undefined,
              isCommon = result === undefined;
          if (isCommon) {
            result = srcValue;
            if (isArrayLike(srcValue) && (isArray(srcValue) || isTypedArray(srcValue))) {
              result = isArray(value) ? value : (isArrayLike(value) ? arrayCopy(value) : []);
            } else if (isPlainObject(srcValue) || isArguments(srcValue)) {
              result = isArguments(value) ? toPlainObject(value) : (isPlainObject(value) ? value : {});
            } else {
              isCommon = false;
            }
          }
          stackA.push(srcValue);
          stackB.push(result);
          if (isCommon) {
            object[key] = mergeFunc(result, srcValue, customizer, stackA, stackB);
          } else if (result === result ? (result !== value) : (value === value)) {
            object[key] = result;
          }
        }
        function baseProperty(key) {
          return function(object) {
            return object == null ? undefined : object[key];
          };
        }
        function basePropertyDeep(path) {
          var pathKey = (path + '');
          path = toPath(path);
          return function(object) {
            return baseGet(object, path, pathKey);
          };
        }
        function basePullAt(array, indexes) {
          var length = array ? indexes.length : 0;
          while (length--) {
            var index = indexes[length];
            if (index != previous && isIndex(index)) {
              var previous = index;
              splice.call(array, index, 1);
            }
          }
          return array;
        }
        function baseRandom(min, max) {
          return min + nativeFloor(nativeRandom() * (max - min + 1));
        }
        function baseReduce(collection, iteratee, accumulator, initFromCollection, eachFunc) {
          eachFunc(collection, function(value, index, collection) {
            accumulator = initFromCollection ? (initFromCollection = false, value) : iteratee(accumulator, value, index, collection);
          });
          return accumulator;
        }
        var baseSetData = !metaMap ? identity : function(func, data) {
          metaMap.set(func, data);
          return func;
        };
        function baseSlice(array, start, end) {
          var index = -1,
              length = array.length;
          start = start == null ? 0 : (+start || 0);
          if (start < 0) {
            start = -start > length ? 0 : (length + start);
          }
          end = (end === undefined || end > length) ? length : (+end || 0);
          if (end < 0) {
            end += length;
          }
          length = start > end ? 0 : ((end - start) >>> 0);
          start >>>= 0;
          var result = Array(length);
          while (++index < length) {
            result[index] = array[index + start];
          }
          return result;
        }
        function baseSome(collection, predicate) {
          var result;
          baseEach(collection, function(value, index, collection) {
            result = predicate(value, index, collection);
            return !result;
          });
          return !!result;
        }
        function baseSortBy(array, comparer) {
          var length = array.length;
          array.sort(comparer);
          while (length--) {
            array[length] = array[length].value;
          }
          return array;
        }
        function baseSortByOrder(collection, iteratees, orders) {
          var callback = getCallback(),
              index = -1;
          iteratees = arrayMap(iteratees, function(iteratee) {
            return callback(iteratee);
          });
          var result = baseMap(collection, function(value) {
            var criteria = arrayMap(iteratees, function(iteratee) {
              return iteratee(value);
            });
            return {
              'criteria': criteria,
              'index': ++index,
              'value': value
            };
          });
          return baseSortBy(result, function(object, other) {
            return compareMultiple(object, other, orders);
          });
        }
        function baseSum(collection, iteratee) {
          var result = 0;
          baseEach(collection, function(value, index, collection) {
            result += +iteratee(value, index, collection) || 0;
          });
          return result;
        }
        function baseUniq(array, iteratee) {
          var index = -1,
              indexOf = getIndexOf(),
              length = array.length,
              isCommon = indexOf == baseIndexOf,
              isLarge = isCommon && length >= LARGE_ARRAY_SIZE,
              seen = isLarge ? createCache() : null,
              result = [];
          if (seen) {
            indexOf = cacheIndexOf;
            isCommon = false;
          } else {
            isLarge = false;
            seen = iteratee ? [] : result;
          }
          outer: while (++index < length) {
            var value = array[index],
                computed = iteratee ? iteratee(value, index, array) : value;
            if (isCommon && value === value) {
              var seenIndex = seen.length;
              while (seenIndex--) {
                if (seen[seenIndex] === computed) {
                  continue outer;
                }
              }
              if (iteratee) {
                seen.push(computed);
              }
              result.push(value);
            } else if (indexOf(seen, computed, 0) < 0) {
              if (iteratee || isLarge) {
                seen.push(computed);
              }
              result.push(value);
            }
          }
          return result;
        }
        function baseValues(object, props) {
          var index = -1,
              length = props.length,
              result = Array(length);
          while (++index < length) {
            result[index] = object[props[index]];
          }
          return result;
        }
        function baseWhile(array, predicate, isDrop, fromRight) {
          var length = array.length,
              index = fromRight ? length : -1;
          while ((fromRight ? index-- : ++index < length) && predicate(array[index], index, array)) {}
          return isDrop ? baseSlice(array, (fromRight ? 0 : index), (fromRight ? index + 1 : length)) : baseSlice(array, (fromRight ? index + 1 : 0), (fromRight ? length : index));
        }
        function baseWrapperValue(value, actions) {
          var result = value;
          if (result instanceof LazyWrapper) {
            result = result.value();
          }
          var index = -1,
              length = actions.length;
          while (++index < length) {
            var action = actions[index];
            result = action.func.apply(action.thisArg, arrayPush([result], action.args));
          }
          return result;
        }
        function binaryIndex(array, value, retHighest) {
          var low = 0,
              high = array ? array.length : low;
          if (typeof value == 'number' && value === value && high <= HALF_MAX_ARRAY_LENGTH) {
            while (low < high) {
              var mid = (low + high) >>> 1,
                  computed = array[mid];
              if ((retHighest ? (computed <= value) : (computed < value)) && computed !== null) {
                low = mid + 1;
              } else {
                high = mid;
              }
            }
            return high;
          }
          return binaryIndexBy(array, value, identity, retHighest);
        }
        function binaryIndexBy(array, value, iteratee, retHighest) {
          value = iteratee(value);
          var low = 0,
              high = array ? array.length : 0,
              valIsNaN = value !== value,
              valIsNull = value === null,
              valIsUndef = value === undefined;
          while (low < high) {
            var mid = nativeFloor((low + high) / 2),
                computed = iteratee(array[mid]),
                isDef = computed !== undefined,
                isReflexive = computed === computed;
            if (valIsNaN) {
              var setLow = isReflexive || retHighest;
            } else if (valIsNull) {
              setLow = isReflexive && isDef && (retHighest || computed != null);
            } else if (valIsUndef) {
              setLow = isReflexive && (retHighest || isDef);
            } else if (computed == null) {
              setLow = false;
            } else {
              setLow = retHighest ? (computed <= value) : (computed < value);
            }
            if (setLow) {
              low = mid + 1;
            } else {
              high = mid;
            }
          }
          return nativeMin(high, MAX_ARRAY_INDEX);
        }
        function bindCallback(func, thisArg, argCount) {
          if (typeof func != 'function') {
            return identity;
          }
          if (thisArg === undefined) {
            return func;
          }
          switch (argCount) {
            case 1:
              return function(value) {
                return func.call(thisArg, value);
              };
            case 3:
              return function(value, index, collection) {
                return func.call(thisArg, value, index, collection);
              };
            case 4:
              return function(accumulator, value, index, collection) {
                return func.call(thisArg, accumulator, value, index, collection);
              };
            case 5:
              return function(value, other, key, object, source) {
                return func.call(thisArg, value, other, key, object, source);
              };
          }
          return function() {
            return func.apply(thisArg, arguments);
          };
        }
        function bufferClone(buffer) {
          var result = new ArrayBuffer(buffer.byteLength),
              view = new Uint8Array(result);
          view.set(new Uint8Array(buffer));
          return result;
        }
        function composeArgs(args, partials, holders) {
          var holdersLength = holders.length,
              argsIndex = -1,
              argsLength = nativeMax(args.length - holdersLength, 0),
              leftIndex = -1,
              leftLength = partials.length,
              result = Array(leftLength + argsLength);
          while (++leftIndex < leftLength) {
            result[leftIndex] = partials[leftIndex];
          }
          while (++argsIndex < holdersLength) {
            result[holders[argsIndex]] = args[argsIndex];
          }
          while (argsLength--) {
            result[leftIndex++] = args[argsIndex++];
          }
          return result;
        }
        function composeArgsRight(args, partials, holders) {
          var holdersIndex = -1,
              holdersLength = holders.length,
              argsIndex = -1,
              argsLength = nativeMax(args.length - holdersLength, 0),
              rightIndex = -1,
              rightLength = partials.length,
              result = Array(argsLength + rightLength);
          while (++argsIndex < argsLength) {
            result[argsIndex] = args[argsIndex];
          }
          var offset = argsIndex;
          while (++rightIndex < rightLength) {
            result[offset + rightIndex] = partials[rightIndex];
          }
          while (++holdersIndex < holdersLength) {
            result[offset + holders[holdersIndex]] = args[argsIndex++];
          }
          return result;
        }
        function createAggregator(setter, initializer) {
          return function(collection, iteratee, thisArg) {
            var result = initializer ? initializer() : {};
            iteratee = getCallback(iteratee, thisArg, 3);
            if (isArray(collection)) {
              var index = -1,
                  length = collection.length;
              while (++index < length) {
                var value = collection[index];
                setter(result, value, iteratee(value, index, collection), collection);
              }
            } else {
              baseEach(collection, function(value, key, collection) {
                setter(result, value, iteratee(value, key, collection), collection);
              });
            }
            return result;
          };
        }
        function createAssigner(assigner) {
          return restParam(function(object, sources) {
            var index = -1,
                length = object == null ? 0 : sources.length,
                customizer = length > 2 ? sources[length - 2] : undefined,
                guard = length > 2 ? sources[2] : undefined,
                thisArg = length > 1 ? sources[length - 1] : undefined;
            if (typeof customizer == 'function') {
              customizer = bindCallback(customizer, thisArg, 5);
              length -= 2;
            } else {
              customizer = typeof thisArg == 'function' ? thisArg : undefined;
              length -= (customizer ? 1 : 0);
            }
            if (guard && isIterateeCall(sources[0], sources[1], guard)) {
              customizer = length < 3 ? undefined : customizer;
              length = 1;
            }
            while (++index < length) {
              var source = sources[index];
              if (source) {
                assigner(object, source, customizer);
              }
            }
            return object;
          });
        }
        function createBaseEach(eachFunc, fromRight) {
          return function(collection, iteratee) {
            var length = collection ? getLength(collection) : 0;
            if (!isLength(length)) {
              return eachFunc(collection, iteratee);
            }
            var index = fromRight ? length : -1,
                iterable = toObject(collection);
            while ((fromRight ? index-- : ++index < length)) {
              if (iteratee(iterable[index], index, iterable) === false) {
                break;
              }
            }
            return collection;
          };
        }
        function createBaseFor(fromRight) {
          return function(object, iteratee, keysFunc) {
            var iterable = toObject(object),
                props = keysFunc(object),
                length = props.length,
                index = fromRight ? length : -1;
            while ((fromRight ? index-- : ++index < length)) {
              var key = props[index];
              if (iteratee(iterable[key], key, iterable) === false) {
                break;
              }
            }
            return object;
          };
        }
        function createBindWrapper(func, thisArg) {
          var Ctor = createCtorWrapper(func);
          function wrapper() {
            var fn = (this && this !== root && this instanceof wrapper) ? Ctor : func;
            return fn.apply(thisArg, arguments);
          }
          return wrapper;
        }
        function createCache(values) {
          return (nativeCreate && Set) ? new SetCache(values) : null;
        }
        function createCompounder(callback) {
          return function(string) {
            var index = -1,
                array = words(deburr(string)),
                length = array.length,
                result = '';
            while (++index < length) {
              result = callback(result, array[index], index);
            }
            return result;
          };
        }
        function createCtorWrapper(Ctor) {
          return function() {
            var args = arguments;
            switch (args.length) {
              case 0:
                return new Ctor;
              case 1:
                return new Ctor(args[0]);
              case 2:
                return new Ctor(args[0], args[1]);
              case 3:
                return new Ctor(args[0], args[1], args[2]);
              case 4:
                return new Ctor(args[0], args[1], args[2], args[3]);
              case 5:
                return new Ctor(args[0], args[1], args[2], args[3], args[4]);
              case 6:
                return new Ctor(args[0], args[1], args[2], args[3], args[4], args[5]);
              case 7:
                return new Ctor(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
            }
            var thisBinding = baseCreate(Ctor.prototype),
                result = Ctor.apply(thisBinding, args);
            return isObject(result) ? result : thisBinding;
          };
        }
        function createCurry(flag) {
          function curryFunc(func, arity, guard) {
            if (guard && isIterateeCall(func, arity, guard)) {
              arity = undefined;
            }
            var result = createWrapper(func, flag, undefined, undefined, undefined, undefined, undefined, arity);
            result.placeholder = curryFunc.placeholder;
            return result;
          }
          return curryFunc;
        }
        function createDefaults(assigner, customizer) {
          return restParam(function(args) {
            var object = args[0];
            if (object == null) {
              return object;
            }
            args.push(customizer);
            return assigner.apply(undefined, args);
          });
        }
        function createExtremum(comparator, exValue) {
          return function(collection, iteratee, thisArg) {
            if (thisArg && isIterateeCall(collection, iteratee, thisArg)) {
              iteratee = undefined;
            }
            iteratee = getCallback(iteratee, thisArg, 3);
            if (iteratee.length == 1) {
              collection = isArray(collection) ? collection : toIterable(collection);
              var result = arrayExtremum(collection, iteratee, comparator, exValue);
              if (!(collection.length && result === exValue)) {
                return result;
              }
            }
            return baseExtremum(collection, iteratee, comparator, exValue);
          };
        }
        function createFind(eachFunc, fromRight) {
          return function(collection, predicate, thisArg) {
            predicate = getCallback(predicate, thisArg, 3);
            if (isArray(collection)) {
              var index = baseFindIndex(collection, predicate, fromRight);
              return index > -1 ? collection[index] : undefined;
            }
            return baseFind(collection, predicate, eachFunc);
          };
        }
        function createFindIndex(fromRight) {
          return function(array, predicate, thisArg) {
            if (!(array && array.length)) {
              return -1;
            }
            predicate = getCallback(predicate, thisArg, 3);
            return baseFindIndex(array, predicate, fromRight);
          };
        }
        function createFindKey(objectFunc) {
          return function(object, predicate, thisArg) {
            predicate = getCallback(predicate, thisArg, 3);
            return baseFind(object, predicate, objectFunc, true);
          };
        }
        function createFlow(fromRight) {
          return function() {
            var wrapper,
                length = arguments.length,
                index = fromRight ? length : -1,
                leftIndex = 0,
                funcs = Array(length);
            while ((fromRight ? index-- : ++index < length)) {
              var func = funcs[leftIndex++] = arguments[index];
              if (typeof func != 'function') {
                throw new TypeError(FUNC_ERROR_TEXT);
              }
              if (!wrapper && LodashWrapper.prototype.thru && getFuncName(func) == 'wrapper') {
                wrapper = new LodashWrapper([], true);
              }
            }
            index = wrapper ? -1 : length;
            while (++index < length) {
              func = funcs[index];
              var funcName = getFuncName(func),
                  data = funcName == 'wrapper' ? getData(func) : undefined;
              if (data && isLaziable(data[0]) && data[1] == (ARY_FLAG | CURRY_FLAG | PARTIAL_FLAG | REARG_FLAG) && !data[4].length && data[9] == 1) {
                wrapper = wrapper[getFuncName(data[0])].apply(wrapper, data[3]);
              } else {
                wrapper = (func.length == 1 && isLaziable(func)) ? wrapper[funcName]() : wrapper.thru(func);
              }
            }
            return function() {
              var args = arguments,
                  value = args[0];
              if (wrapper && args.length == 1 && isArray(value) && value.length >= LARGE_ARRAY_SIZE) {
                return wrapper.plant(value).value();
              }
              var index = 0,
                  result = length ? funcs[index].apply(this, args) : value;
              while (++index < length) {
                result = funcs[index].call(this, result);
              }
              return result;
            };
          };
        }
        function createForEach(arrayFunc, eachFunc) {
          return function(collection, iteratee, thisArg) {
            return (typeof iteratee == 'function' && thisArg === undefined && isArray(collection)) ? arrayFunc(collection, iteratee) : eachFunc(collection, bindCallback(iteratee, thisArg, 3));
          };
        }
        function createForIn(objectFunc) {
          return function(object, iteratee, thisArg) {
            if (typeof iteratee != 'function' || thisArg !== undefined) {
              iteratee = bindCallback(iteratee, thisArg, 3);
            }
            return objectFunc(object, iteratee, keysIn);
          };
        }
        function createForOwn(objectFunc) {
          return function(object, iteratee, thisArg) {
            if (typeof iteratee != 'function' || thisArg !== undefined) {
              iteratee = bindCallback(iteratee, thisArg, 3);
            }
            return objectFunc(object, iteratee);
          };
        }
        function createObjectMapper(isMapKeys) {
          return function(object, iteratee, thisArg) {
            var result = {};
            iteratee = getCallback(iteratee, thisArg, 3);
            baseForOwn(object, function(value, key, object) {
              var mapped = iteratee(value, key, object);
              key = isMapKeys ? mapped : key;
              value = isMapKeys ? value : mapped;
              result[key] = value;
            });
            return result;
          };
        }
        function createPadDir(fromRight) {
          return function(string, length, chars) {
            string = baseToString(string);
            return (fromRight ? string : '') + createPadding(string, length, chars) + (fromRight ? '' : string);
          };
        }
        function createPartial(flag) {
          var partialFunc = restParam(function(func, partials) {
            var holders = replaceHolders(partials, partialFunc.placeholder);
            return createWrapper(func, flag, undefined, partials, holders);
          });
          return partialFunc;
        }
        function createReduce(arrayFunc, eachFunc) {
          return function(collection, iteratee, accumulator, thisArg) {
            var initFromArray = arguments.length < 3;
            return (typeof iteratee == 'function' && thisArg === undefined && isArray(collection)) ? arrayFunc(collection, iteratee, accumulator, initFromArray) : baseReduce(collection, getCallback(iteratee, thisArg, 4), accumulator, initFromArray, eachFunc);
          };
        }
        function createHybridWrapper(func, bitmask, thisArg, partials, holders, partialsRight, holdersRight, argPos, ary, arity) {
          var isAry = bitmask & ARY_FLAG,
              isBind = bitmask & BIND_FLAG,
              isBindKey = bitmask & BIND_KEY_FLAG,
              isCurry = bitmask & CURRY_FLAG,
              isCurryBound = bitmask & CURRY_BOUND_FLAG,
              isCurryRight = bitmask & CURRY_RIGHT_FLAG,
              Ctor = isBindKey ? undefined : createCtorWrapper(func);
          function wrapper() {
            var length = arguments.length,
                index = length,
                args = Array(length);
            while (index--) {
              args[index] = arguments[index];
            }
            if (partials) {
              args = composeArgs(args, partials, holders);
            }
            if (partialsRight) {
              args = composeArgsRight(args, partialsRight, holdersRight);
            }
            if (isCurry || isCurryRight) {
              var placeholder = wrapper.placeholder,
                  argsHolders = replaceHolders(args, placeholder);
              length -= argsHolders.length;
              if (length < arity) {
                var newArgPos = argPos ? arrayCopy(argPos) : undefined,
                    newArity = nativeMax(arity - length, 0),
                    newsHolders = isCurry ? argsHolders : undefined,
                    newHoldersRight = isCurry ? undefined : argsHolders,
                    newPartials = isCurry ? args : undefined,
                    newPartialsRight = isCurry ? undefined : args;
                bitmask |= (isCurry ? PARTIAL_FLAG : PARTIAL_RIGHT_FLAG);
                bitmask &= ~(isCurry ? PARTIAL_RIGHT_FLAG : PARTIAL_FLAG);
                if (!isCurryBound) {
                  bitmask &= ~(BIND_FLAG | BIND_KEY_FLAG);
                }
                var newData = [func, bitmask, thisArg, newPartials, newsHolders, newPartialsRight, newHoldersRight, newArgPos, ary, newArity],
                    result = createHybridWrapper.apply(undefined, newData);
                if (isLaziable(func)) {
                  setData(result, newData);
                }
                result.placeholder = placeholder;
                return result;
              }
            }
            var thisBinding = isBind ? thisArg : this,
                fn = isBindKey ? thisBinding[func] : func;
            if (argPos) {
              args = reorder(args, argPos);
            }
            if (isAry && ary < args.length) {
              args.length = ary;
            }
            if (this && this !== root && this instanceof wrapper) {
              fn = Ctor || createCtorWrapper(func);
            }
            return fn.apply(thisBinding, args);
          }
          return wrapper;
        }
        function createPadding(string, length, chars) {
          var strLength = string.length;
          length = +length;
          if (strLength >= length || !nativeIsFinite(length)) {
            return '';
          }
          var padLength = length - strLength;
          chars = chars == null ? ' ' : (chars + '');
          return repeat(chars, nativeCeil(padLength / chars.length)).slice(0, padLength);
        }
        function createPartialWrapper(func, bitmask, thisArg, partials) {
          var isBind = bitmask & BIND_FLAG,
              Ctor = createCtorWrapper(func);
          function wrapper() {
            var argsIndex = -1,
                argsLength = arguments.length,
                leftIndex = -1,
                leftLength = partials.length,
                args = Array(leftLength + argsLength);
            while (++leftIndex < leftLength) {
              args[leftIndex] = partials[leftIndex];
            }
            while (argsLength--) {
              args[leftIndex++] = arguments[++argsIndex];
            }
            var fn = (this && this !== root && this instanceof wrapper) ? Ctor : func;
            return fn.apply(isBind ? thisArg : this, args);
          }
          return wrapper;
        }
        function createRound(methodName) {
          var func = Math[methodName];
          return function(number, precision) {
            precision = precision === undefined ? 0 : (+precision || 0);
            if (precision) {
              precision = pow(10, precision);
              return func(number * precision) / precision;
            }
            return func(number);
          };
        }
        function createSortedIndex(retHighest) {
          return function(array, value, iteratee, thisArg) {
            var callback = getCallback(iteratee);
            return (iteratee == null && callback === baseCallback) ? binaryIndex(array, value, retHighest) : binaryIndexBy(array, value, callback(iteratee, thisArg, 1), retHighest);
          };
        }
        function createWrapper(func, bitmask, thisArg, partials, holders, argPos, ary, arity) {
          var isBindKey = bitmask & BIND_KEY_FLAG;
          if (!isBindKey && typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          var length = partials ? partials.length : 0;
          if (!length) {
            bitmask &= ~(PARTIAL_FLAG | PARTIAL_RIGHT_FLAG);
            partials = holders = undefined;
          }
          length -= (holders ? holders.length : 0);
          if (bitmask & PARTIAL_RIGHT_FLAG) {
            var partialsRight = partials,
                holdersRight = holders;
            partials = holders = undefined;
          }
          var data = isBindKey ? undefined : getData(func),
              newData = [func, bitmask, thisArg, partials, holders, partialsRight, holdersRight, argPos, ary, arity];
          if (data) {
            mergeData(newData, data);
            bitmask = newData[1];
            arity = newData[9];
          }
          newData[9] = arity == null ? (isBindKey ? 0 : func.length) : (nativeMax(arity - length, 0) || 0);
          if (bitmask == BIND_FLAG) {
            var result = createBindWrapper(newData[0], newData[2]);
          } else if ((bitmask == PARTIAL_FLAG || bitmask == (BIND_FLAG | PARTIAL_FLAG)) && !newData[4].length) {
            result = createPartialWrapper.apply(undefined, newData);
          } else {
            result = createHybridWrapper.apply(undefined, newData);
          }
          var setter = data ? baseSetData : setData;
          return setter(result, newData);
        }
        function equalArrays(array, other, equalFunc, customizer, isLoose, stackA, stackB) {
          var index = -1,
              arrLength = array.length,
              othLength = other.length;
          if (arrLength != othLength && !(isLoose && othLength > arrLength)) {
            return false;
          }
          while (++index < arrLength) {
            var arrValue = array[index],
                othValue = other[index],
                result = customizer ? customizer(isLoose ? othValue : arrValue, isLoose ? arrValue : othValue, index) : undefined;
            if (result !== undefined) {
              if (result) {
                continue;
              }
              return false;
            }
            if (isLoose) {
              if (!arraySome(other, function(othValue) {
                return arrValue === othValue || equalFunc(arrValue, othValue, customizer, isLoose, stackA, stackB);
              })) {
                return false;
              }
            } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, customizer, isLoose, stackA, stackB))) {
              return false;
            }
          }
          return true;
        }
        function equalByTag(object, other, tag) {
          switch (tag) {
            case boolTag:
            case dateTag:
              return +object == +other;
            case errorTag:
              return object.name == other.name && object.message == other.message;
            case numberTag:
              return (object != +object) ? other != +other : object == +other;
            case regexpTag:
            case stringTag:
              return object == (other + '');
          }
          return false;
        }
        function equalObjects(object, other, equalFunc, customizer, isLoose, stackA, stackB) {
          var objProps = keys(object),
              objLength = objProps.length,
              othProps = keys(other),
              othLength = othProps.length;
          if (objLength != othLength && !isLoose) {
            return false;
          }
          var index = objLength;
          while (index--) {
            var key = objProps[index];
            if (!(isLoose ? key in other : hasOwnProperty.call(other, key))) {
              return false;
            }
          }
          var skipCtor = isLoose;
          while (++index < objLength) {
            key = objProps[index];
            var objValue = object[key],
                othValue = other[key],
                result = customizer ? customizer(isLoose ? othValue : objValue, isLoose ? objValue : othValue, key) : undefined;
            if (!(result === undefined ? equalFunc(objValue, othValue, customizer, isLoose, stackA, stackB) : result)) {
              return false;
            }
            skipCtor || (skipCtor = key == 'constructor');
          }
          if (!skipCtor) {
            var objCtor = object.constructor,
                othCtor = other.constructor;
            if (objCtor != othCtor && ('constructor' in object && 'constructor' in other) && !(typeof objCtor == 'function' && objCtor instanceof objCtor && typeof othCtor == 'function' && othCtor instanceof othCtor)) {
              return false;
            }
          }
          return true;
        }
        function getCallback(func, thisArg, argCount) {
          var result = lodash.callback || callback;
          result = result === callback ? baseCallback : result;
          return argCount ? result(func, thisArg, argCount) : result;
        }
        var getData = !metaMap ? noop : function(func) {
          return metaMap.get(func);
        };
        function getFuncName(func) {
          var result = func.name,
              array = realNames[result],
              length = array ? array.length : 0;
          while (length--) {
            var data = array[length],
                otherFunc = data.func;
            if (otherFunc == null || otherFunc == func) {
              return data.name;
            }
          }
          return result;
        }
        function getIndexOf(collection, target, fromIndex) {
          var result = lodash.indexOf || indexOf;
          result = result === indexOf ? baseIndexOf : result;
          return collection ? result(collection, target, fromIndex) : result;
        }
        var getLength = baseProperty('length');
        function getMatchData(object) {
          var result = pairs(object),
              length = result.length;
          while (length--) {
            result[length][2] = isStrictComparable(result[length][1]);
          }
          return result;
        }
        function getNative(object, key) {
          var value = object == null ? undefined : object[key];
          return isNative(value) ? value : undefined;
        }
        function getView(start, end, transforms) {
          var index = -1,
              length = transforms.length;
          while (++index < length) {
            var data = transforms[index],
                size = data.size;
            switch (data.type) {
              case 'drop':
                start += size;
                break;
              case 'dropRight':
                end -= size;
                break;
              case 'take':
                end = nativeMin(end, start + size);
                break;
              case 'takeRight':
                start = nativeMax(start, end - size);
                break;
            }
          }
          return {
            'start': start,
            'end': end
          };
        }
        function initCloneArray(array) {
          var length = array.length,
              result = new array.constructor(length);
          if (length && typeof array[0] == 'string' && hasOwnProperty.call(array, 'index')) {
            result.index = array.index;
            result.input = array.input;
          }
          return result;
        }
        function initCloneObject(object) {
          var Ctor = object.constructor;
          if (!(typeof Ctor == 'function' && Ctor instanceof Ctor)) {
            Ctor = Object;
          }
          return new Ctor;
        }
        function initCloneByTag(object, tag, isDeep) {
          var Ctor = object.constructor;
          switch (tag) {
            case arrayBufferTag:
              return bufferClone(object);
            case boolTag:
            case dateTag:
              return new Ctor(+object);
            case float32Tag:
            case float64Tag:
            case int8Tag:
            case int16Tag:
            case int32Tag:
            case uint8Tag:
            case uint8ClampedTag:
            case uint16Tag:
            case uint32Tag:
              var buffer = object.buffer;
              return new Ctor(isDeep ? bufferClone(buffer) : buffer, object.byteOffset, object.length);
            case numberTag:
            case stringTag:
              return new Ctor(object);
            case regexpTag:
              var result = new Ctor(object.source, reFlags.exec(object));
              result.lastIndex = object.lastIndex;
          }
          return result;
        }
        function invokePath(object, path, args) {
          if (object != null && !isKey(path, object)) {
            path = toPath(path);
            object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
            path = last(path);
          }
          var func = object == null ? object : object[path];
          return func == null ? undefined : func.apply(object, args);
        }
        function isArrayLike(value) {
          return value != null && isLength(getLength(value));
        }
        function isIndex(value, length) {
          value = (typeof value == 'number' || reIsUint.test(value)) ? +value : -1;
          length = length == null ? MAX_SAFE_INTEGER : length;
          return value > -1 && value % 1 == 0 && value < length;
        }
        function isIterateeCall(value, index, object) {
          if (!isObject(object)) {
            return false;
          }
          var type = typeof index;
          if (type == 'number' ? (isArrayLike(object) && isIndex(index, object.length)) : (type == 'string' && index in object)) {
            var other = object[index];
            return value === value ? (value === other) : (other !== other);
          }
          return false;
        }
        function isKey(value, object) {
          var type = typeof value;
          if ((type == 'string' && reIsPlainProp.test(value)) || type == 'number') {
            return true;
          }
          if (isArray(value)) {
            return false;
          }
          var result = !reIsDeepProp.test(value);
          return result || (object != null && value in toObject(object));
        }
        function isLaziable(func) {
          var funcName = getFuncName(func);
          if (!(funcName in LazyWrapper.prototype)) {
            return false;
          }
          var other = lodash[funcName];
          if (func === other) {
            return true;
          }
          var data = getData(other);
          return !!data && func === data[0];
        }
        function isLength(value) {
          return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
        }
        function isStrictComparable(value) {
          return value === value && !isObject(value);
        }
        function mergeData(data, source) {
          var bitmask = data[1],
              srcBitmask = source[1],
              newBitmask = bitmask | srcBitmask,
              isCommon = newBitmask < ARY_FLAG;
          var isCombo = (srcBitmask == ARY_FLAG && bitmask == CURRY_FLAG) || (srcBitmask == ARY_FLAG && bitmask == REARG_FLAG && data[7].length <= source[8]) || (srcBitmask == (ARY_FLAG | REARG_FLAG) && bitmask == CURRY_FLAG);
          if (!(isCommon || isCombo)) {
            return data;
          }
          if (srcBitmask & BIND_FLAG) {
            data[2] = source[2];
            newBitmask |= (bitmask & BIND_FLAG) ? 0 : CURRY_BOUND_FLAG;
          }
          var value = source[3];
          if (value) {
            var partials = data[3];
            data[3] = partials ? composeArgs(partials, value, source[4]) : arrayCopy(value);
            data[4] = partials ? replaceHolders(data[3], PLACEHOLDER) : arrayCopy(source[4]);
          }
          value = source[5];
          if (value) {
            partials = data[5];
            data[5] = partials ? composeArgsRight(partials, value, source[6]) : arrayCopy(value);
            data[6] = partials ? replaceHolders(data[5], PLACEHOLDER) : arrayCopy(source[6]);
          }
          value = source[7];
          if (value) {
            data[7] = arrayCopy(value);
          }
          if (srcBitmask & ARY_FLAG) {
            data[8] = data[8] == null ? source[8] : nativeMin(data[8], source[8]);
          }
          if (data[9] == null) {
            data[9] = source[9];
          }
          data[0] = source[0];
          data[1] = newBitmask;
          return data;
        }
        function mergeDefaults(objectValue, sourceValue) {
          return objectValue === undefined ? sourceValue : merge(objectValue, sourceValue, mergeDefaults);
        }
        function pickByArray(object, props) {
          object = toObject(object);
          var index = -1,
              length = props.length,
              result = {};
          while (++index < length) {
            var key = props[index];
            if (key in object) {
              result[key] = object[key];
            }
          }
          return result;
        }
        function pickByCallback(object, predicate) {
          var result = {};
          baseForIn(object, function(value, key, object) {
            if (predicate(value, key, object)) {
              result[key] = value;
            }
          });
          return result;
        }
        function reorder(array, indexes) {
          var arrLength = array.length,
              length = nativeMin(indexes.length, arrLength),
              oldArray = arrayCopy(array);
          while (length--) {
            var index = indexes[length];
            array[length] = isIndex(index, arrLength) ? oldArray[index] : undefined;
          }
          return array;
        }
        var setData = (function() {
          var count = 0,
              lastCalled = 0;
          return function(key, value) {
            var stamp = now(),
                remaining = HOT_SPAN - (stamp - lastCalled);
            lastCalled = stamp;
            if (remaining > 0) {
              if (++count >= HOT_COUNT) {
                return key;
              }
            } else {
              count = 0;
            }
            return baseSetData(key, value);
          };
        }());
        function shimKeys(object) {
          var props = keysIn(object),
              propsLength = props.length,
              length = propsLength && object.length;
          var allowIndexes = !!length && isLength(length) && (isArray(object) || isArguments(object));
          var index = -1,
              result = [];
          while (++index < propsLength) {
            var key = props[index];
            if ((allowIndexes && isIndex(key, length)) || hasOwnProperty.call(object, key)) {
              result.push(key);
            }
          }
          return result;
        }
        function toIterable(value) {
          if (value == null) {
            return [];
          }
          if (!isArrayLike(value)) {
            return values(value);
          }
          return isObject(value) ? value : Object(value);
        }
        function toObject(value) {
          return isObject(value) ? value : Object(value);
        }
        function toPath(value) {
          if (isArray(value)) {
            return value;
          }
          var result = [];
          baseToString(value).replace(rePropName, function(match, number, quote, string) {
            result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
          });
          return result;
        }
        function wrapperClone(wrapper) {
          return wrapper instanceof LazyWrapper ? wrapper.clone() : new LodashWrapper(wrapper.__wrapped__, wrapper.__chain__, arrayCopy(wrapper.__actions__));
        }
        function chunk(array, size, guard) {
          if (guard ? isIterateeCall(array, size, guard) : size == null) {
            size = 1;
          } else {
            size = nativeMax(nativeFloor(size) || 1, 1);
          }
          var index = 0,
              length = array ? array.length : 0,
              resIndex = -1,
              result = Array(nativeCeil(length / size));
          while (index < length) {
            result[++resIndex] = baseSlice(array, index, (index += size));
          }
          return result;
        }
        function compact(array) {
          var index = -1,
              length = array ? array.length : 0,
              resIndex = -1,
              result = [];
          while (++index < length) {
            var value = array[index];
            if (value) {
              result[++resIndex] = value;
            }
          }
          return result;
        }
        var difference = restParam(function(array, values) {
          return (isObjectLike(array) && isArrayLike(array)) ? baseDifference(array, baseFlatten(values, false, true)) : [];
        });
        function drop(array, n, guard) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (guard ? isIterateeCall(array, n, guard) : n == null) {
            n = 1;
          }
          return baseSlice(array, n < 0 ? 0 : n);
        }
        function dropRight(array, n, guard) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (guard ? isIterateeCall(array, n, guard) : n == null) {
            n = 1;
          }
          n = length - (+n || 0);
          return baseSlice(array, 0, n < 0 ? 0 : n);
        }
        function dropRightWhile(array, predicate, thisArg) {
          return (array && array.length) ? baseWhile(array, getCallback(predicate, thisArg, 3), true, true) : [];
        }
        function dropWhile(array, predicate, thisArg) {
          return (array && array.length) ? baseWhile(array, getCallback(predicate, thisArg, 3), true) : [];
        }
        function fill(array, value, start, end) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (start && typeof start != 'number' && isIterateeCall(array, value, start)) {
            start = 0;
            end = length;
          }
          return baseFill(array, value, start, end);
        }
        var findIndex = createFindIndex();
        var findLastIndex = createFindIndex(true);
        function first(array) {
          return array ? array[0] : undefined;
        }
        function flatten(array, isDeep, guard) {
          var length = array ? array.length : 0;
          if (guard && isIterateeCall(array, isDeep, guard)) {
            isDeep = false;
          }
          return length ? baseFlatten(array, isDeep) : [];
        }
        function flattenDeep(array) {
          var length = array ? array.length : 0;
          return length ? baseFlatten(array, true) : [];
        }
        function indexOf(array, value, fromIndex) {
          var length = array ? array.length : 0;
          if (!length) {
            return -1;
          }
          if (typeof fromIndex == 'number') {
            fromIndex = fromIndex < 0 ? nativeMax(length + fromIndex, 0) : fromIndex;
          } else if (fromIndex) {
            var index = binaryIndex(array, value);
            if (index < length && (value === value ? (value === array[index]) : (array[index] !== array[index]))) {
              return index;
            }
            return -1;
          }
          return baseIndexOf(array, value, fromIndex || 0);
        }
        function initial(array) {
          return dropRight(array, 1);
        }
        var intersection = restParam(function(arrays) {
          var othLength = arrays.length,
              othIndex = othLength,
              caches = Array(length),
              indexOf = getIndexOf(),
              isCommon = indexOf == baseIndexOf,
              result = [];
          while (othIndex--) {
            var value = arrays[othIndex] = isArrayLike(value = arrays[othIndex]) ? value : [];
            caches[othIndex] = (isCommon && value.length >= 120) ? createCache(othIndex && value) : null;
          }
          var array = arrays[0],
              index = -1,
              length = array ? array.length : 0,
              seen = caches[0];
          outer: while (++index < length) {
            value = array[index];
            if ((seen ? cacheIndexOf(seen, value) : indexOf(result, value, 0)) < 0) {
              var othIndex = othLength;
              while (--othIndex) {
                var cache = caches[othIndex];
                if ((cache ? cacheIndexOf(cache, value) : indexOf(arrays[othIndex], value, 0)) < 0) {
                  continue outer;
                }
              }
              if (seen) {
                seen.push(value);
              }
              result.push(value);
            }
          }
          return result;
        });
        function last(array) {
          var length = array ? array.length : 0;
          return length ? array[length - 1] : undefined;
        }
        function lastIndexOf(array, value, fromIndex) {
          var length = array ? array.length : 0;
          if (!length) {
            return -1;
          }
          var index = length;
          if (typeof fromIndex == 'number') {
            index = (fromIndex < 0 ? nativeMax(length + fromIndex, 0) : nativeMin(fromIndex || 0, length - 1)) + 1;
          } else if (fromIndex) {
            index = binaryIndex(array, value, true) - 1;
            var other = array[index];
            if (value === value ? (value === other) : (other !== other)) {
              return index;
            }
            return -1;
          }
          if (value !== value) {
            return indexOfNaN(array, index, true);
          }
          while (index--) {
            if (array[index] === value) {
              return index;
            }
          }
          return -1;
        }
        function pull() {
          var args = arguments,
              array = args[0];
          if (!(array && array.length)) {
            return array;
          }
          var index = 0,
              indexOf = getIndexOf(),
              length = args.length;
          while (++index < length) {
            var fromIndex = 0,
                value = args[index];
            while ((fromIndex = indexOf(array, value, fromIndex)) > -1) {
              splice.call(array, fromIndex, 1);
            }
          }
          return array;
        }
        var pullAt = restParam(function(array, indexes) {
          indexes = baseFlatten(indexes);
          var result = baseAt(array, indexes);
          basePullAt(array, indexes.sort(baseCompareAscending));
          return result;
        });
        function remove(array, predicate, thisArg) {
          var result = [];
          if (!(array && array.length)) {
            return result;
          }
          var index = -1,
              indexes = [],
              length = array.length;
          predicate = getCallback(predicate, thisArg, 3);
          while (++index < length) {
            var value = array[index];
            if (predicate(value, index, array)) {
              result.push(value);
              indexes.push(index);
            }
          }
          basePullAt(array, indexes);
          return result;
        }
        function rest(array) {
          return drop(array, 1);
        }
        function slice(array, start, end) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (end && typeof end != 'number' && isIterateeCall(array, start, end)) {
            start = 0;
            end = length;
          }
          return baseSlice(array, start, end);
        }
        var sortedIndex = createSortedIndex();
        var sortedLastIndex = createSortedIndex(true);
        function take(array, n, guard) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (guard ? isIterateeCall(array, n, guard) : n == null) {
            n = 1;
          }
          return baseSlice(array, 0, n < 0 ? 0 : n);
        }
        function takeRight(array, n, guard) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (guard ? isIterateeCall(array, n, guard) : n == null) {
            n = 1;
          }
          n = length - (+n || 0);
          return baseSlice(array, n < 0 ? 0 : n);
        }
        function takeRightWhile(array, predicate, thisArg) {
          return (array && array.length) ? baseWhile(array, getCallback(predicate, thisArg, 3), false, true) : [];
        }
        function takeWhile(array, predicate, thisArg) {
          return (array && array.length) ? baseWhile(array, getCallback(predicate, thisArg, 3)) : [];
        }
        var union = restParam(function(arrays) {
          return baseUniq(baseFlatten(arrays, false, true));
        });
        function uniq(array, isSorted, iteratee, thisArg) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (isSorted != null && typeof isSorted != 'boolean') {
            thisArg = iteratee;
            iteratee = isIterateeCall(array, isSorted, thisArg) ? undefined : isSorted;
            isSorted = false;
          }
          var callback = getCallback();
          if (!(iteratee == null && callback === baseCallback)) {
            iteratee = callback(iteratee, thisArg, 3);
          }
          return (isSorted && getIndexOf() == baseIndexOf) ? sortedUniq(array, iteratee) : baseUniq(array, iteratee);
        }
        function unzip(array) {
          if (!(array && array.length)) {
            return [];
          }
          var index = -1,
              length = 0;
          array = arrayFilter(array, function(group) {
            if (isArrayLike(group)) {
              length = nativeMax(group.length, length);
              return true;
            }
          });
          var result = Array(length);
          while (++index < length) {
            result[index] = arrayMap(array, baseProperty(index));
          }
          return result;
        }
        function unzipWith(array, iteratee, thisArg) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          var result = unzip(array);
          if (iteratee == null) {
            return result;
          }
          iteratee = bindCallback(iteratee, thisArg, 4);
          return arrayMap(result, function(group) {
            return arrayReduce(group, iteratee, undefined, true);
          });
        }
        var without = restParam(function(array, values) {
          return isArrayLike(array) ? baseDifference(array, values) : [];
        });
        function xor() {
          var index = -1,
              length = arguments.length;
          while (++index < length) {
            var array = arguments[index];
            if (isArrayLike(array)) {
              var result = result ? arrayPush(baseDifference(result, array), baseDifference(array, result)) : array;
            }
          }
          return result ? baseUniq(result) : [];
        }
        var zip = restParam(unzip);
        function zipObject(props, values) {
          var index = -1,
              length = props ? props.length : 0,
              result = {};
          if (length && !values && !isArray(props[0])) {
            values = [];
          }
          while (++index < length) {
            var key = props[index];
            if (values) {
              result[key] = values[index];
            } else if (key) {
              result[key[0]] = key[1];
            }
          }
          return result;
        }
        var zipWith = restParam(function(arrays) {
          var length = arrays.length,
              iteratee = length > 2 ? arrays[length - 2] : undefined,
              thisArg = length > 1 ? arrays[length - 1] : undefined;
          if (length > 2 && typeof iteratee == 'function') {
            length -= 2;
          } else {
            iteratee = (length > 1 && typeof thisArg == 'function') ? (--length, thisArg) : undefined;
            thisArg = undefined;
          }
          arrays.length = length;
          return unzipWith(arrays, iteratee, thisArg);
        });
        function chain(value) {
          var result = lodash(value);
          result.__chain__ = true;
          return result;
        }
        function tap(value, interceptor, thisArg) {
          interceptor.call(thisArg, value);
          return value;
        }
        function thru(value, interceptor, thisArg) {
          return interceptor.call(thisArg, value);
        }
        function wrapperChain() {
          return chain(this);
        }
        function wrapperCommit() {
          return new LodashWrapper(this.value(), this.__chain__);
        }
        var wrapperConcat = restParam(function(values) {
          values = baseFlatten(values);
          return this.thru(function(array) {
            return arrayConcat(isArray(array) ? array : [toObject(array)], values);
          });
        });
        function wrapperPlant(value) {
          var result,
              parent = this;
          while (parent instanceof baseLodash) {
            var clone = wrapperClone(parent);
            if (result) {
              previous.__wrapped__ = clone;
            } else {
              result = clone;
            }
            var previous = clone;
            parent = parent.__wrapped__;
          }
          previous.__wrapped__ = value;
          return result;
        }
        function wrapperReverse() {
          var value = this.__wrapped__;
          var interceptor = function(value) {
            return (wrapped && wrapped.__dir__ < 0) ? value : value.reverse();
          };
          if (value instanceof LazyWrapper) {
            var wrapped = value;
            if (this.__actions__.length) {
              wrapped = new LazyWrapper(this);
            }
            wrapped = wrapped.reverse();
            wrapped.__actions__.push({
              'func': thru,
              'args': [interceptor],
              'thisArg': undefined
            });
            return new LodashWrapper(wrapped, this.__chain__);
          }
          return this.thru(interceptor);
        }
        function wrapperToString() {
          return (this.value() + '');
        }
        function wrapperValue() {
          return baseWrapperValue(this.__wrapped__, this.__actions__);
        }
        var at = restParam(function(collection, props) {
          return baseAt(collection, baseFlatten(props));
        });
        var countBy = createAggregator(function(result, value, key) {
          hasOwnProperty.call(result, key) ? ++result[key] : (result[key] = 1);
        });
        function every(collection, predicate, thisArg) {
          var func = isArray(collection) ? arrayEvery : baseEvery;
          if (thisArg && isIterateeCall(collection, predicate, thisArg)) {
            predicate = undefined;
          }
          if (typeof predicate != 'function' || thisArg !== undefined) {
            predicate = getCallback(predicate, thisArg, 3);
          }
          return func(collection, predicate);
        }
        function filter(collection, predicate, thisArg) {
          var func = isArray(collection) ? arrayFilter : baseFilter;
          predicate = getCallback(predicate, thisArg, 3);
          return func(collection, predicate);
        }
        var find = createFind(baseEach);
        var findLast = createFind(baseEachRight, true);
        function findWhere(collection, source) {
          return find(collection, baseMatches(source));
        }
        var forEach = createForEach(arrayEach, baseEach);
        var forEachRight = createForEach(arrayEachRight, baseEachRight);
        var groupBy = createAggregator(function(result, value, key) {
          if (hasOwnProperty.call(result, key)) {
            result[key].push(value);
          } else {
            result[key] = [value];
          }
        });
        function includes(collection, target, fromIndex, guard) {
          var length = collection ? getLength(collection) : 0;
          if (!isLength(length)) {
            collection = values(collection);
            length = collection.length;
          }
          if (typeof fromIndex != 'number' || (guard && isIterateeCall(target, fromIndex, guard))) {
            fromIndex = 0;
          } else {
            fromIndex = fromIndex < 0 ? nativeMax(length + fromIndex, 0) : (fromIndex || 0);
          }
          return (typeof collection == 'string' || !isArray(collection) && isString(collection)) ? (fromIndex <= length && collection.indexOf(target, fromIndex) > -1) : (!!length && getIndexOf(collection, target, fromIndex) > -1);
        }
        var indexBy = createAggregator(function(result, value, key) {
          result[key] = value;
        });
        var invoke = restParam(function(collection, path, args) {
          var index = -1,
              isFunc = typeof path == 'function',
              isProp = isKey(path),
              result = isArrayLike(collection) ? Array(collection.length) : [];
          baseEach(collection, function(value) {
            var func = isFunc ? path : ((isProp && value != null) ? value[path] : undefined);
            result[++index] = func ? func.apply(value, args) : invokePath(value, path, args);
          });
          return result;
        });
        function map(collection, iteratee, thisArg) {
          var func = isArray(collection) ? arrayMap : baseMap;
          iteratee = getCallback(iteratee, thisArg, 3);
          return func(collection, iteratee);
        }
        var partition = createAggregator(function(result, value, key) {
          result[key ? 0 : 1].push(value);
        }, function() {
          return [[], []];
        });
        function pluck(collection, path) {
          return map(collection, property(path));
        }
        var reduce = createReduce(arrayReduce, baseEach);
        var reduceRight = createReduce(arrayReduceRight, baseEachRight);
        function reject(collection, predicate, thisArg) {
          var func = isArray(collection) ? arrayFilter : baseFilter;
          predicate = getCallback(predicate, thisArg, 3);
          return func(collection, function(value, index, collection) {
            return !predicate(value, index, collection);
          });
        }
        function sample(collection, n, guard) {
          if (guard ? isIterateeCall(collection, n, guard) : n == null) {
            collection = toIterable(collection);
            var length = collection.length;
            return length > 0 ? collection[baseRandom(0, length - 1)] : undefined;
          }
          var index = -1,
              result = toArray(collection),
              length = result.length,
              lastIndex = length - 1;
          n = nativeMin(n < 0 ? 0 : (+n || 0), length);
          while (++index < n) {
            var rand = baseRandom(index, lastIndex),
                value = result[rand];
            result[rand] = result[index];
            result[index] = value;
          }
          result.length = n;
          return result;
        }
        function shuffle(collection) {
          return sample(collection, POSITIVE_INFINITY);
        }
        function size(collection) {
          var length = collection ? getLength(collection) : 0;
          return isLength(length) ? length : keys(collection).length;
        }
        function some(collection, predicate, thisArg) {
          var func = isArray(collection) ? arraySome : baseSome;
          if (thisArg && isIterateeCall(collection, predicate, thisArg)) {
            predicate = undefined;
          }
          if (typeof predicate != 'function' || thisArg !== undefined) {
            predicate = getCallback(predicate, thisArg, 3);
          }
          return func(collection, predicate);
        }
        function sortBy(collection, iteratee, thisArg) {
          if (collection == null) {
            return [];
          }
          if (thisArg && isIterateeCall(collection, iteratee, thisArg)) {
            iteratee = undefined;
          }
          var index = -1;
          iteratee = getCallback(iteratee, thisArg, 3);
          var result = baseMap(collection, function(value, key, collection) {
            return {
              'criteria': iteratee(value, key, collection),
              'index': ++index,
              'value': value
            };
          });
          return baseSortBy(result, compareAscending);
        }
        var sortByAll = restParam(function(collection, iteratees) {
          if (collection == null) {
            return [];
          }
          var guard = iteratees[2];
          if (guard && isIterateeCall(iteratees[0], iteratees[1], guard)) {
            iteratees.length = 1;
          }
          return baseSortByOrder(collection, baseFlatten(iteratees), []);
        });
        function sortByOrder(collection, iteratees, orders, guard) {
          if (collection == null) {
            return [];
          }
          if (guard && isIterateeCall(iteratees, orders, guard)) {
            orders = undefined;
          }
          if (!isArray(iteratees)) {
            iteratees = iteratees == null ? [] : [iteratees];
          }
          if (!isArray(orders)) {
            orders = orders == null ? [] : [orders];
          }
          return baseSortByOrder(collection, iteratees, orders);
        }
        function where(collection, source) {
          return filter(collection, baseMatches(source));
        }
        var now = nativeNow || function() {
          return new Date().getTime();
        };
        function after(n, func) {
          if (typeof func != 'function') {
            if (typeof n == 'function') {
              var temp = n;
              n = func;
              func = temp;
            } else {
              throw new TypeError(FUNC_ERROR_TEXT);
            }
          }
          n = nativeIsFinite(n = +n) ? n : 0;
          return function() {
            if (--n < 1) {
              return func.apply(this, arguments);
            }
          };
        }
        function ary(func, n, guard) {
          if (guard && isIterateeCall(func, n, guard)) {
            n = undefined;
          }
          n = (func && n == null) ? func.length : nativeMax(+n || 0, 0);
          return createWrapper(func, ARY_FLAG, undefined, undefined, undefined, undefined, n);
        }
        function before(n, func) {
          var result;
          if (typeof func != 'function') {
            if (typeof n == 'function') {
              var temp = n;
              n = func;
              func = temp;
            } else {
              throw new TypeError(FUNC_ERROR_TEXT);
            }
          }
          return function() {
            if (--n > 0) {
              result = func.apply(this, arguments);
            }
            if (n <= 1) {
              func = undefined;
            }
            return result;
          };
        }
        var bind = restParam(function(func, thisArg, partials) {
          var bitmask = BIND_FLAG;
          if (partials.length) {
            var holders = replaceHolders(partials, bind.placeholder);
            bitmask |= PARTIAL_FLAG;
          }
          return createWrapper(func, bitmask, thisArg, partials, holders);
        });
        var bindAll = restParam(function(object, methodNames) {
          methodNames = methodNames.length ? baseFlatten(methodNames) : functions(object);
          var index = -1,
              length = methodNames.length;
          while (++index < length) {
            var key = methodNames[index];
            object[key] = createWrapper(object[key], BIND_FLAG, object);
          }
          return object;
        });
        var bindKey = restParam(function(object, key, partials) {
          var bitmask = BIND_FLAG | BIND_KEY_FLAG;
          if (partials.length) {
            var holders = replaceHolders(partials, bindKey.placeholder);
            bitmask |= PARTIAL_FLAG;
          }
          return createWrapper(key, bitmask, object, partials, holders);
        });
        var curry = createCurry(CURRY_FLAG);
        var curryRight = createCurry(CURRY_RIGHT_FLAG);
        function debounce(func, wait, options) {
          var args,
              maxTimeoutId,
              result,
              stamp,
              thisArg,
              timeoutId,
              trailingCall,
              lastCalled = 0,
              maxWait = false,
              trailing = true;
          if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          wait = wait < 0 ? 0 : (+wait || 0);
          if (options === true) {
            var leading = true;
            trailing = false;
          } else if (isObject(options)) {
            leading = !!options.leading;
            maxWait = 'maxWait' in options && nativeMax(+options.maxWait || 0, wait);
            trailing = 'trailing' in options ? !!options.trailing : trailing;
          }
          function cancel() {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            if (maxTimeoutId) {
              clearTimeout(maxTimeoutId);
            }
            lastCalled = 0;
            maxTimeoutId = timeoutId = trailingCall = undefined;
          }
          function complete(isCalled, id) {
            if (id) {
              clearTimeout(id);
            }
            maxTimeoutId = timeoutId = trailingCall = undefined;
            if (isCalled) {
              lastCalled = now();
              result = func.apply(thisArg, args);
              if (!timeoutId && !maxTimeoutId) {
                args = thisArg = undefined;
              }
            }
          }
          function delayed() {
            var remaining = wait - (now() - stamp);
            if (remaining <= 0 || remaining > wait) {
              complete(trailingCall, maxTimeoutId);
            } else {
              timeoutId = setTimeout(delayed, remaining);
            }
          }
          function maxDelayed() {
            complete(trailing, timeoutId);
          }
          function debounced() {
            args = arguments;
            stamp = now();
            thisArg = this;
            trailingCall = trailing && (timeoutId || !leading);
            if (maxWait === false) {
              var leadingCall = leading && !timeoutId;
            } else {
              if (!maxTimeoutId && !leading) {
                lastCalled = stamp;
              }
              var remaining = maxWait - (stamp - lastCalled),
                  isCalled = remaining <= 0 || remaining > maxWait;
              if (isCalled) {
                if (maxTimeoutId) {
                  maxTimeoutId = clearTimeout(maxTimeoutId);
                }
                lastCalled = stamp;
                result = func.apply(thisArg, args);
              } else if (!maxTimeoutId) {
                maxTimeoutId = setTimeout(maxDelayed, remaining);
              }
            }
            if (isCalled && timeoutId) {
              timeoutId = clearTimeout(timeoutId);
            } else if (!timeoutId && wait !== maxWait) {
              timeoutId = setTimeout(delayed, wait);
            }
            if (leadingCall) {
              isCalled = true;
              result = func.apply(thisArg, args);
            }
            if (isCalled && !timeoutId && !maxTimeoutId) {
              args = thisArg = undefined;
            }
            return result;
          }
          debounced.cancel = cancel;
          return debounced;
        }
        var defer = restParam(function(func, args) {
          return baseDelay(func, 1, args);
        });
        var delay = restParam(function(func, wait, args) {
          return baseDelay(func, wait, args);
        });
        var flow = createFlow();
        var flowRight = createFlow(true);
        function memoize(func, resolver) {
          if (typeof func != 'function' || (resolver && typeof resolver != 'function')) {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          var memoized = function() {
            var args = arguments,
                key = resolver ? resolver.apply(this, args) : args[0],
                cache = memoized.cache;
            if (cache.has(key)) {
              return cache.get(key);
            }
            var result = func.apply(this, args);
            memoized.cache = cache.set(key, result);
            return result;
          };
          memoized.cache = new memoize.Cache;
          return memoized;
        }
        var modArgs = restParam(function(func, transforms) {
          transforms = baseFlatten(transforms);
          if (typeof func != 'function' || !arrayEvery(transforms, baseIsFunction)) {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          var length = transforms.length;
          return restParam(function(args) {
            var index = nativeMin(args.length, length);
            while (index--) {
              args[index] = transforms[index](args[index]);
            }
            return func.apply(this, args);
          });
        });
        function negate(predicate) {
          if (typeof predicate != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          return function() {
            return !predicate.apply(this, arguments);
          };
        }
        function once(func) {
          return before(2, func);
        }
        var partial = createPartial(PARTIAL_FLAG);
        var partialRight = createPartial(PARTIAL_RIGHT_FLAG);
        var rearg = restParam(function(func, indexes) {
          return createWrapper(func, REARG_FLAG, undefined, undefined, undefined, baseFlatten(indexes));
        });
        function restParam(func, start) {
          if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          start = nativeMax(start === undefined ? (func.length - 1) : (+start || 0), 0);
          return function() {
            var args = arguments,
                index = -1,
                length = nativeMax(args.length - start, 0),
                rest = Array(length);
            while (++index < length) {
              rest[index] = args[start + index];
            }
            switch (start) {
              case 0:
                return func.call(this, rest);
              case 1:
                return func.call(this, args[0], rest);
              case 2:
                return func.call(this, args[0], args[1], rest);
            }
            var otherArgs = Array(start + 1);
            index = -1;
            while (++index < start) {
              otherArgs[index] = args[index];
            }
            otherArgs[start] = rest;
            return func.apply(this, otherArgs);
          };
        }
        function spread(func) {
          if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          return function(array) {
            return func.apply(this, array);
          };
        }
        function throttle(func, wait, options) {
          var leading = true,
              trailing = true;
          if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          if (options === false) {
            leading = false;
          } else if (isObject(options)) {
            leading = 'leading' in options ? !!options.leading : leading;
            trailing = 'trailing' in options ? !!options.trailing : trailing;
          }
          return debounce(func, wait, {
            'leading': leading,
            'maxWait': +wait,
            'trailing': trailing
          });
        }
        function wrap(value, wrapper) {
          wrapper = wrapper == null ? identity : wrapper;
          return createWrapper(wrapper, PARTIAL_FLAG, undefined, [value], []);
        }
        function clone(value, isDeep, customizer, thisArg) {
          if (isDeep && typeof isDeep != 'boolean' && isIterateeCall(value, isDeep, customizer)) {
            isDeep = false;
          } else if (typeof isDeep == 'function') {
            thisArg = customizer;
            customizer = isDeep;
            isDeep = false;
          }
          return typeof customizer == 'function' ? baseClone(value, isDeep, bindCallback(customizer, thisArg, 1)) : baseClone(value, isDeep);
        }
        function cloneDeep(value, customizer, thisArg) {
          return typeof customizer == 'function' ? baseClone(value, true, bindCallback(customizer, thisArg, 1)) : baseClone(value, true);
        }
        function gt(value, other) {
          return value > other;
        }
        function gte(value, other) {
          return value >= other;
        }
        function isArguments(value) {
          return isObjectLike(value) && isArrayLike(value) && hasOwnProperty.call(value, 'callee') && !propertyIsEnumerable.call(value, 'callee');
        }
        var isArray = nativeIsArray || function(value) {
          return isObjectLike(value) && isLength(value.length) && objToString.call(value) == arrayTag;
        };
        function isBoolean(value) {
          return value === true || value === false || (isObjectLike(value) && objToString.call(value) == boolTag);
        }
        function isDate(value) {
          return isObjectLike(value) && objToString.call(value) == dateTag;
        }
        function isElement(value) {
          return !!value && value.nodeType === 1 && isObjectLike(value) && !isPlainObject(value);
        }
        function isEmpty(value) {
          if (value == null) {
            return true;
          }
          if (isArrayLike(value) && (isArray(value) || isString(value) || isArguments(value) || (isObjectLike(value) && isFunction(value.splice)))) {
            return !value.length;
          }
          return !keys(value).length;
        }
        function isEqual(value, other, customizer, thisArg) {
          customizer = typeof customizer == 'function' ? bindCallback(customizer, thisArg, 3) : undefined;
          var result = customizer ? customizer(value, other) : undefined;
          return result === undefined ? baseIsEqual(value, other, customizer) : !!result;
        }
        function isError(value) {
          return isObjectLike(value) && typeof value.message == 'string' && objToString.call(value) == errorTag;
        }
        function isFinite(value) {
          return typeof value == 'number' && nativeIsFinite(value);
        }
        function isFunction(value) {
          return isObject(value) && objToString.call(value) == funcTag;
        }
        function isObject(value) {
          var type = typeof value;
          return !!value && (type == 'object' || type == 'function');
        }
        function isMatch(object, source, customizer, thisArg) {
          customizer = typeof customizer == 'function' ? bindCallback(customizer, thisArg, 3) : undefined;
          return baseIsMatch(object, getMatchData(source), customizer);
        }
        function isNaN(value) {
          return isNumber(value) && value != +value;
        }
        function isNative(value) {
          if (value == null) {
            return false;
          }
          if (isFunction(value)) {
            return reIsNative.test(fnToString.call(value));
          }
          return isObjectLike(value) && reIsHostCtor.test(value);
        }
        function isNull(value) {
          return value === null;
        }
        function isNumber(value) {
          return typeof value == 'number' || (isObjectLike(value) && objToString.call(value) == numberTag);
        }
        function isPlainObject(value) {
          var Ctor;
          if (!(isObjectLike(value) && objToString.call(value) == objectTag && !isArguments(value)) || (!hasOwnProperty.call(value, 'constructor') && (Ctor = value.constructor, typeof Ctor == 'function' && !(Ctor instanceof Ctor)))) {
            return false;
          }
          var result;
          baseForIn(value, function(subValue, key) {
            result = key;
          });
          return result === undefined || hasOwnProperty.call(value, result);
        }
        function isRegExp(value) {
          return isObject(value) && objToString.call(value) == regexpTag;
        }
        function isString(value) {
          return typeof value == 'string' || (isObjectLike(value) && objToString.call(value) == stringTag);
        }
        function isTypedArray(value) {
          return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[objToString.call(value)];
        }
        function isUndefined(value) {
          return value === undefined;
        }
        function lt(value, other) {
          return value < other;
        }
        function lte(value, other) {
          return value <= other;
        }
        function toArray(value) {
          var length = value ? getLength(value) : 0;
          if (!isLength(length)) {
            return values(value);
          }
          if (!length) {
            return [];
          }
          return arrayCopy(value);
        }
        function toPlainObject(value) {
          return baseCopy(value, keysIn(value));
        }
        var merge = createAssigner(baseMerge);
        var assign = createAssigner(function(object, source, customizer) {
          return customizer ? assignWith(object, source, customizer) : baseAssign(object, source);
        });
        function create(prototype, properties, guard) {
          var result = baseCreate(prototype);
          if (guard && isIterateeCall(prototype, properties, guard)) {
            properties = undefined;
          }
          return properties ? baseAssign(result, properties) : result;
        }
        var defaults = createDefaults(assign, assignDefaults);
        var defaultsDeep = createDefaults(merge, mergeDefaults);
        var findKey = createFindKey(baseForOwn);
        var findLastKey = createFindKey(baseForOwnRight);
        var forIn = createForIn(baseFor);
        var forInRight = createForIn(baseForRight);
        var forOwn = createForOwn(baseForOwn);
        var forOwnRight = createForOwn(baseForOwnRight);
        function functions(object) {
          return baseFunctions(object, keysIn(object));
        }
        function get(object, path, defaultValue) {
          var result = object == null ? undefined : baseGet(object, toPath(path), path + '');
          return result === undefined ? defaultValue : result;
        }
        function has(object, path) {
          if (object == null) {
            return false;
          }
          var result = hasOwnProperty.call(object, path);
          if (!result && !isKey(path)) {
            path = toPath(path);
            object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
            if (object == null) {
              return false;
            }
            path = last(path);
            result = hasOwnProperty.call(object, path);
          }
          return result || (isLength(object.length) && isIndex(path, object.length) && (isArray(object) || isArguments(object)));
        }
        function invert(object, multiValue, guard) {
          if (guard && isIterateeCall(object, multiValue, guard)) {
            multiValue = undefined;
          }
          var index = -1,
              props = keys(object),
              length = props.length,
              result = {};
          while (++index < length) {
            var key = props[index],
                value = object[key];
            if (multiValue) {
              if (hasOwnProperty.call(result, value)) {
                result[value].push(key);
              } else {
                result[value] = [key];
              }
            } else {
              result[value] = key;
            }
          }
          return result;
        }
        var keys = !nativeKeys ? shimKeys : function(object) {
          var Ctor = object == null ? undefined : object.constructor;
          if ((typeof Ctor == 'function' && Ctor.prototype === object) || (typeof object != 'function' && isArrayLike(object))) {
            return shimKeys(object);
          }
          return isObject(object) ? nativeKeys(object) : [];
        };
        function keysIn(object) {
          if (object == null) {
            return [];
          }
          if (!isObject(object)) {
            object = Object(object);
          }
          var length = object.length;
          length = (length && isLength(length) && (isArray(object) || isArguments(object)) && length) || 0;
          var Ctor = object.constructor,
              index = -1,
              isProto = typeof Ctor == 'function' && Ctor.prototype === object,
              result = Array(length),
              skipIndexes = length > 0;
          while (++index < length) {
            result[index] = (index + '');
          }
          for (var key in object) {
            if (!(skipIndexes && isIndex(key, length)) && !(key == 'constructor' && (isProto || !hasOwnProperty.call(object, key)))) {
              result.push(key);
            }
          }
          return result;
        }
        var mapKeys = createObjectMapper(true);
        var mapValues = createObjectMapper();
        var omit = restParam(function(object, props) {
          if (object == null) {
            return {};
          }
          if (typeof props[0] != 'function') {
            var props = arrayMap(baseFlatten(props), String);
            return pickByArray(object, baseDifference(keysIn(object), props));
          }
          var predicate = bindCallback(props[0], props[1], 3);
          return pickByCallback(object, function(value, key, object) {
            return !predicate(value, key, object);
          });
        });
        function pairs(object) {
          object = toObject(object);
          var index = -1,
              props = keys(object),
              length = props.length,
              result = Array(length);
          while (++index < length) {
            var key = props[index];
            result[index] = [key, object[key]];
          }
          return result;
        }
        var pick = restParam(function(object, props) {
          if (object == null) {
            return {};
          }
          return typeof props[0] == 'function' ? pickByCallback(object, bindCallback(props[0], props[1], 3)) : pickByArray(object, baseFlatten(props));
        });
        function result(object, path, defaultValue) {
          var result = object == null ? undefined : object[path];
          if (result === undefined) {
            if (object != null && !isKey(path, object)) {
              path = toPath(path);
              object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
              result = object == null ? undefined : object[last(path)];
            }
            result = result === undefined ? defaultValue : result;
          }
          return isFunction(result) ? result.call(object) : result;
        }
        function set(object, path, value) {
          if (object == null) {
            return object;
          }
          var pathKey = (path + '');
          path = (object[pathKey] != null || isKey(path, object)) ? [pathKey] : toPath(path);
          var index = -1,
              length = path.length,
              lastIndex = length - 1,
              nested = object;
          while (nested != null && ++index < length) {
            var key = path[index];
            if (isObject(nested)) {
              if (index == lastIndex) {
                nested[key] = value;
              } else if (nested[key] == null) {
                nested[key] = isIndex(path[index + 1]) ? [] : {};
              }
            }
            nested = nested[key];
          }
          return object;
        }
        function transform(object, iteratee, accumulator, thisArg) {
          var isArr = isArray(object) || isTypedArray(object);
          iteratee = getCallback(iteratee, thisArg, 4);
          if (accumulator == null) {
            if (isArr || isObject(object)) {
              var Ctor = object.constructor;
              if (isArr) {
                accumulator = isArray(object) ? new Ctor : [];
              } else {
                accumulator = baseCreate(isFunction(Ctor) ? Ctor.prototype : undefined);
              }
            } else {
              accumulator = {};
            }
          }
          (isArr ? arrayEach : baseForOwn)(object, function(value, index, object) {
            return iteratee(accumulator, value, index, object);
          });
          return accumulator;
        }
        function values(object) {
          return baseValues(object, keys(object));
        }
        function valuesIn(object) {
          return baseValues(object, keysIn(object));
        }
        function inRange(value, start, end) {
          start = +start || 0;
          if (end === undefined) {
            end = start;
            start = 0;
          } else {
            end = +end || 0;
          }
          return value >= nativeMin(start, end) && value < nativeMax(start, end);
        }
        function random(min, max, floating) {
          if (floating && isIterateeCall(min, max, floating)) {
            max = floating = undefined;
          }
          var noMin = min == null,
              noMax = max == null;
          if (floating == null) {
            if (noMax && typeof min == 'boolean') {
              floating = min;
              min = 1;
            } else if (typeof max == 'boolean') {
              floating = max;
              noMax = true;
            }
          }
          if (noMin && noMax) {
            max = 1;
            noMax = false;
          }
          min = +min || 0;
          if (noMax) {
            max = min;
            min = 0;
          } else {
            max = +max || 0;
          }
          if (floating || min % 1 || max % 1) {
            var rand = nativeRandom();
            return nativeMin(min + (rand * (max - min + parseFloat('1e-' + ((rand + '').length - 1)))), max);
          }
          return baseRandom(min, max);
        }
        var camelCase = createCompounder(function(result, word, index) {
          word = word.toLowerCase();
          return result + (index ? (word.charAt(0).toUpperCase() + word.slice(1)) : word);
        });
        function capitalize(string) {
          string = baseToString(string);
          return string && (string.charAt(0).toUpperCase() + string.slice(1));
        }
        function deburr(string) {
          string = baseToString(string);
          return string && string.replace(reLatin1, deburrLetter).replace(reComboMark, '');
        }
        function endsWith(string, target, position) {
          string = baseToString(string);
          target = (target + '');
          var length = string.length;
          position = position === undefined ? length : nativeMin(position < 0 ? 0 : (+position || 0), length);
          position -= target.length;
          return position >= 0 && string.indexOf(target, position) == position;
        }
        function escape(string) {
          string = baseToString(string);
          return (string && reHasUnescapedHtml.test(string)) ? string.replace(reUnescapedHtml, escapeHtmlChar) : string;
        }
        function escapeRegExp(string) {
          string = baseToString(string);
          return (string && reHasRegExpChars.test(string)) ? string.replace(reRegExpChars, escapeRegExpChar) : (string || '(?:)');
        }
        var kebabCase = createCompounder(function(result, word, index) {
          return result + (index ? '-' : '') + word.toLowerCase();
        });
        function pad(string, length, chars) {
          string = baseToString(string);
          length = +length;
          var strLength = string.length;
          if (strLength >= length || !nativeIsFinite(length)) {
            return string;
          }
          var mid = (length - strLength) / 2,
              leftLength = nativeFloor(mid),
              rightLength = nativeCeil(mid);
          chars = createPadding('', rightLength, chars);
          return chars.slice(0, leftLength) + string + chars;
        }
        var padLeft = createPadDir();
        var padRight = createPadDir(true);
        function parseInt(string, radix, guard) {
          if (guard ? isIterateeCall(string, radix, guard) : radix == null) {
            radix = 0;
          } else if (radix) {
            radix = +radix;
          }
          string = trim(string);
          return nativeParseInt(string, radix || (reHasHexPrefix.test(string) ? 16 : 10));
        }
        function repeat(string, n) {
          var result = '';
          string = baseToString(string);
          n = +n;
          if (n < 1 || !string || !nativeIsFinite(n)) {
            return result;
          }
          do {
            if (n % 2) {
              result += string;
            }
            n = nativeFloor(n / 2);
            string += string;
          } while (n);
          return result;
        }
        var snakeCase = createCompounder(function(result, word, index) {
          return result + (index ? '_' : '') + word.toLowerCase();
        });
        var startCase = createCompounder(function(result, word, index) {
          return result + (index ? ' ' : '') + (word.charAt(0).toUpperCase() + word.slice(1));
        });
        function startsWith(string, target, position) {
          string = baseToString(string);
          position = position == null ? 0 : nativeMin(position < 0 ? 0 : (+position || 0), string.length);
          return string.lastIndexOf(target, position) == position;
        }
        function template(string, options, otherOptions) {
          var settings = lodash.templateSettings;
          if (otherOptions && isIterateeCall(string, options, otherOptions)) {
            options = otherOptions = undefined;
          }
          string = baseToString(string);
          options = assignWith(baseAssign({}, otherOptions || options), settings, assignOwnDefaults);
          var imports = assignWith(baseAssign({}, options.imports), settings.imports, assignOwnDefaults),
              importsKeys = keys(imports),
              importsValues = baseValues(imports, importsKeys);
          var isEscaping,
              isEvaluating,
              index = 0,
              interpolate = options.interpolate || reNoMatch,
              source = "__p += '";
          var reDelimiters = RegExp((options.escape || reNoMatch).source + '|' + interpolate.source + '|' + (interpolate === reInterpolate ? reEsTemplate : reNoMatch).source + '|' + (options.evaluate || reNoMatch).source + '|$', 'g');
          var sourceURL = '//# sourceURL=' + ('sourceURL' in options ? options.sourceURL : ('lodash.templateSources[' + (++templateCounter) + ']')) + '\n';
          string.replace(reDelimiters, function(match, escapeValue, interpolateValue, esTemplateValue, evaluateValue, offset) {
            interpolateValue || (interpolateValue = esTemplateValue);
            source += string.slice(index, offset).replace(reUnescapedString, escapeStringChar);
            if (escapeValue) {
              isEscaping = true;
              source += "' +\n__e(" + escapeValue + ") +\n'";
            }
            if (evaluateValue) {
              isEvaluating = true;
              source += "';\n" + evaluateValue + ";\n__p += '";
            }
            if (interpolateValue) {
              source += "' +\n((__t = (" + interpolateValue + ")) == null ? '' : __t) +\n'";
            }
            index = offset + match.length;
            return match;
          });
          source += "';\n";
          var variable = options.variable;
          if (!variable) {
            source = 'with (obj) {\n' + source + '\n}\n';
          }
          source = (isEvaluating ? source.replace(reEmptyStringLeading, '') : source).replace(reEmptyStringMiddle, '$1').replace(reEmptyStringTrailing, '$1;');
          source = 'function(' + (variable || 'obj') + ') {\n' + (variable ? '' : 'obj || (obj = {});\n') + "var __t, __p = ''" + (isEscaping ? ', __e = _.escape' : '') + (isEvaluating ? ', __j = Array.prototype.join;\n' + "function print() { __p += __j.call(arguments, '') }\n" : ';\n') + source + 'return __p\n}';
          var result = attempt(function() {
            return Function(importsKeys, sourceURL + 'return ' + source).apply(undefined, importsValues);
          });
          result.source = source;
          if (isError(result)) {
            throw result;
          }
          return result;
        }
        function trim(string, chars, guard) {
          var value = string;
          string = baseToString(string);
          if (!string) {
            return string;
          }
          if (guard ? isIterateeCall(value, chars, guard) : chars == null) {
            return string.slice(trimmedLeftIndex(string), trimmedRightIndex(string) + 1);
          }
          chars = (chars + '');
          return string.slice(charsLeftIndex(string, chars), charsRightIndex(string, chars) + 1);
        }
        function trimLeft(string, chars, guard) {
          var value = string;
          string = baseToString(string);
          if (!string) {
            return string;
          }
          if (guard ? isIterateeCall(value, chars, guard) : chars == null) {
            return string.slice(trimmedLeftIndex(string));
          }
          return string.slice(charsLeftIndex(string, (chars + '')));
        }
        function trimRight(string, chars, guard) {
          var value = string;
          string = baseToString(string);
          if (!string) {
            return string;
          }
          if (guard ? isIterateeCall(value, chars, guard) : chars == null) {
            return string.slice(0, trimmedRightIndex(string) + 1);
          }
          return string.slice(0, charsRightIndex(string, (chars + '')) + 1);
        }
        function trunc(string, options, guard) {
          if (guard && isIterateeCall(string, options, guard)) {
            options = undefined;
          }
          var length = DEFAULT_TRUNC_LENGTH,
              omission = DEFAULT_TRUNC_OMISSION;
          if (options != null) {
            if (isObject(options)) {
              var separator = 'separator' in options ? options.separator : separator;
              length = 'length' in options ? (+options.length || 0) : length;
              omission = 'omission' in options ? baseToString(options.omission) : omission;
            } else {
              length = +options || 0;
            }
          }
          string = baseToString(string);
          if (length >= string.length) {
            return string;
          }
          var end = length - omission.length;
          if (end < 1) {
            return omission;
          }
          var result = string.slice(0, end);
          if (separator == null) {
            return result + omission;
          }
          if (isRegExp(separator)) {
            if (string.slice(end).search(separator)) {
              var match,
                  newEnd,
                  substring = string.slice(0, end);
              if (!separator.global) {
                separator = RegExp(separator.source, (reFlags.exec(separator) || '') + 'g');
              }
              separator.lastIndex = 0;
              while ((match = separator.exec(substring))) {
                newEnd = match.index;
              }
              result = result.slice(0, newEnd == null ? end : newEnd);
            }
          } else if (string.indexOf(separator, end) != end) {
            var index = result.lastIndexOf(separator);
            if (index > -1) {
              result = result.slice(0, index);
            }
          }
          return result + omission;
        }
        function unescape(string) {
          string = baseToString(string);
          return (string && reHasEscapedHtml.test(string)) ? string.replace(reEscapedHtml, unescapeHtmlChar) : string;
        }
        function words(string, pattern, guard) {
          if (guard && isIterateeCall(string, pattern, guard)) {
            pattern = undefined;
          }
          string = baseToString(string);
          return string.match(pattern || reWords) || [];
        }
        var attempt = restParam(function(func, args) {
          try {
            return func.apply(undefined, args);
          } catch (e) {
            return isError(e) ? e : new Error(e);
          }
        });
        function callback(func, thisArg, guard) {
          if (guard && isIterateeCall(func, thisArg, guard)) {
            thisArg = undefined;
          }
          return isObjectLike(func) ? matches(func) : baseCallback(func, thisArg);
        }
        function constant(value) {
          return function() {
            return value;
          };
        }
        function identity(value) {
          return value;
        }
        function matches(source) {
          return baseMatches(baseClone(source, true));
        }
        function matchesProperty(path, srcValue) {
          return baseMatchesProperty(path, baseClone(srcValue, true));
        }
        var method = restParam(function(path, args) {
          return function(object) {
            return invokePath(object, path, args);
          };
        });
        var methodOf = restParam(function(object, args) {
          return function(path) {
            return invokePath(object, path, args);
          };
        });
        function mixin(object, source, options) {
          if (options == null) {
            var isObj = isObject(source),
                props = isObj ? keys(source) : undefined,
                methodNames = (props && props.length) ? baseFunctions(source, props) : undefined;
            if (!(methodNames ? methodNames.length : isObj)) {
              methodNames = false;
              options = source;
              source = object;
              object = this;
            }
          }
          if (!methodNames) {
            methodNames = baseFunctions(source, keys(source));
          }
          var chain = true,
              index = -1,
              isFunc = isFunction(object),
              length = methodNames.length;
          if (options === false) {
            chain = false;
          } else if (isObject(options) && 'chain' in options) {
            chain = options.chain;
          }
          while (++index < length) {
            var methodName = methodNames[index],
                func = source[methodName];
            object[methodName] = func;
            if (isFunc) {
              object.prototype[methodName] = (function(func) {
                return function() {
                  var chainAll = this.__chain__;
                  if (chain || chainAll) {
                    var result = object(this.__wrapped__),
                        actions = result.__actions__ = arrayCopy(this.__actions__);
                    actions.push({
                      'func': func,
                      'args': arguments,
                      'thisArg': object
                    });
                    result.__chain__ = chainAll;
                    return result;
                  }
                  return func.apply(object, arrayPush([this.value()], arguments));
                };
              }(func));
            }
          }
          return object;
        }
        function noConflict() {
          root._ = oldDash;
          return this;
        }
        function noop() {}
        function property(path) {
          return isKey(path) ? baseProperty(path) : basePropertyDeep(path);
        }
        function propertyOf(object) {
          return function(path) {
            return baseGet(object, toPath(path), path + '');
          };
        }
        function range(start, end, step) {
          if (step && isIterateeCall(start, end, step)) {
            end = step = undefined;
          }
          start = +start || 0;
          step = step == null ? 1 : (+step || 0);
          if (end == null) {
            end = start;
            start = 0;
          } else {
            end = +end || 0;
          }
          var index = -1,
              length = nativeMax(nativeCeil((end - start) / (step || 1)), 0),
              result = Array(length);
          while (++index < length) {
            result[index] = start;
            start += step;
          }
          return result;
        }
        function times(n, iteratee, thisArg) {
          n = nativeFloor(n);
          if (n < 1 || !nativeIsFinite(n)) {
            return [];
          }
          var index = -1,
              result = Array(nativeMin(n, MAX_ARRAY_LENGTH));
          iteratee = bindCallback(iteratee, thisArg, 1);
          while (++index < n) {
            if (index < MAX_ARRAY_LENGTH) {
              result[index] = iteratee(index);
            } else {
              iteratee(index);
            }
          }
          return result;
        }
        function uniqueId(prefix) {
          var id = ++idCounter;
          return baseToString(prefix) + id;
        }
        function add(augend, addend) {
          return (+augend || 0) + (+addend || 0);
        }
        var ceil = createRound('ceil');
        var floor = createRound('floor');
        var max = createExtremum(gt, NEGATIVE_INFINITY);
        var min = createExtremum(lt, POSITIVE_INFINITY);
        var round = createRound('round');
        function sum(collection, iteratee, thisArg) {
          if (thisArg && isIterateeCall(collection, iteratee, thisArg)) {
            iteratee = undefined;
          }
          iteratee = getCallback(iteratee, thisArg, 3);
          return iteratee.length == 1 ? arraySum(isArray(collection) ? collection : toIterable(collection), iteratee) : baseSum(collection, iteratee);
        }
        lodash.prototype = baseLodash.prototype;
        LodashWrapper.prototype = baseCreate(baseLodash.prototype);
        LodashWrapper.prototype.constructor = LodashWrapper;
        LazyWrapper.prototype = baseCreate(baseLodash.prototype);
        LazyWrapper.prototype.constructor = LazyWrapper;
        MapCache.prototype['delete'] = mapDelete;
        MapCache.prototype.get = mapGet;
        MapCache.prototype.has = mapHas;
        MapCache.prototype.set = mapSet;
        SetCache.prototype.push = cachePush;
        memoize.Cache = MapCache;
        lodash.after = after;
        lodash.ary = ary;
        lodash.assign = assign;
        lodash.at = at;
        lodash.before = before;
        lodash.bind = bind;
        lodash.bindAll = bindAll;
        lodash.bindKey = bindKey;
        lodash.callback = callback;
        lodash.chain = chain;
        lodash.chunk = chunk;
        lodash.compact = compact;
        lodash.constant = constant;
        lodash.countBy = countBy;
        lodash.create = create;
        lodash.curry = curry;
        lodash.curryRight = curryRight;
        lodash.debounce = debounce;
        lodash.defaults = defaults;
        lodash.defaultsDeep = defaultsDeep;
        lodash.defer = defer;
        lodash.delay = delay;
        lodash.difference = difference;
        lodash.drop = drop;
        lodash.dropRight = dropRight;
        lodash.dropRightWhile = dropRightWhile;
        lodash.dropWhile = dropWhile;
        lodash.fill = fill;
        lodash.filter = filter;
        lodash.flatten = flatten;
        lodash.flattenDeep = flattenDeep;
        lodash.flow = flow;
        lodash.flowRight = flowRight;
        lodash.forEach = forEach;
        lodash.forEachRight = forEachRight;
        lodash.forIn = forIn;
        lodash.forInRight = forInRight;
        lodash.forOwn = forOwn;
        lodash.forOwnRight = forOwnRight;
        lodash.functions = functions;
        lodash.groupBy = groupBy;
        lodash.indexBy = indexBy;
        lodash.initial = initial;
        lodash.intersection = intersection;
        lodash.invert = invert;
        lodash.invoke = invoke;
        lodash.keys = keys;
        lodash.keysIn = keysIn;
        lodash.map = map;
        lodash.mapKeys = mapKeys;
        lodash.mapValues = mapValues;
        lodash.matches = matches;
        lodash.matchesProperty = matchesProperty;
        lodash.memoize = memoize;
        lodash.merge = merge;
        lodash.method = method;
        lodash.methodOf = methodOf;
        lodash.mixin = mixin;
        lodash.modArgs = modArgs;
        lodash.negate = negate;
        lodash.omit = omit;
        lodash.once = once;
        lodash.pairs = pairs;
        lodash.partial = partial;
        lodash.partialRight = partialRight;
        lodash.partition = partition;
        lodash.pick = pick;
        lodash.pluck = pluck;
        lodash.property = property;
        lodash.propertyOf = propertyOf;
        lodash.pull = pull;
        lodash.pullAt = pullAt;
        lodash.range = range;
        lodash.rearg = rearg;
        lodash.reject = reject;
        lodash.remove = remove;
        lodash.rest = rest;
        lodash.restParam = restParam;
        lodash.set = set;
        lodash.shuffle = shuffle;
        lodash.slice = slice;
        lodash.sortBy = sortBy;
        lodash.sortByAll = sortByAll;
        lodash.sortByOrder = sortByOrder;
        lodash.spread = spread;
        lodash.take = take;
        lodash.takeRight = takeRight;
        lodash.takeRightWhile = takeRightWhile;
        lodash.takeWhile = takeWhile;
        lodash.tap = tap;
        lodash.throttle = throttle;
        lodash.thru = thru;
        lodash.times = times;
        lodash.toArray = toArray;
        lodash.toPlainObject = toPlainObject;
        lodash.transform = transform;
        lodash.union = union;
        lodash.uniq = uniq;
        lodash.unzip = unzip;
        lodash.unzipWith = unzipWith;
        lodash.values = values;
        lodash.valuesIn = valuesIn;
        lodash.where = where;
        lodash.without = without;
        lodash.wrap = wrap;
        lodash.xor = xor;
        lodash.zip = zip;
        lodash.zipObject = zipObject;
        lodash.zipWith = zipWith;
        lodash.backflow = flowRight;
        lodash.collect = map;
        lodash.compose = flowRight;
        lodash.each = forEach;
        lodash.eachRight = forEachRight;
        lodash.extend = assign;
        lodash.iteratee = callback;
        lodash.methods = functions;
        lodash.object = zipObject;
        lodash.select = filter;
        lodash.tail = rest;
        lodash.unique = uniq;
        mixin(lodash, lodash);
        lodash.add = add;
        lodash.attempt = attempt;
        lodash.camelCase = camelCase;
        lodash.capitalize = capitalize;
        lodash.ceil = ceil;
        lodash.clone = clone;
        lodash.cloneDeep = cloneDeep;
        lodash.deburr = deburr;
        lodash.endsWith = endsWith;
        lodash.escape = escape;
        lodash.escapeRegExp = escapeRegExp;
        lodash.every = every;
        lodash.find = find;
        lodash.findIndex = findIndex;
        lodash.findKey = findKey;
        lodash.findLast = findLast;
        lodash.findLastIndex = findLastIndex;
        lodash.findLastKey = findLastKey;
        lodash.findWhere = findWhere;
        lodash.first = first;
        lodash.floor = floor;
        lodash.get = get;
        lodash.gt = gt;
        lodash.gte = gte;
        lodash.has = has;
        lodash.identity = identity;
        lodash.includes = includes;
        lodash.indexOf = indexOf;
        lodash.inRange = inRange;
        lodash.isArguments = isArguments;
        lodash.isArray = isArray;
        lodash.isBoolean = isBoolean;
        lodash.isDate = isDate;
        lodash.isElement = isElement;
        lodash.isEmpty = isEmpty;
        lodash.isEqual = isEqual;
        lodash.isError = isError;
        lodash.isFinite = isFinite;
        lodash.isFunction = isFunction;
        lodash.isMatch = isMatch;
        lodash.isNaN = isNaN;
        lodash.isNative = isNative;
        lodash.isNull = isNull;
        lodash.isNumber = isNumber;
        lodash.isObject = isObject;
        lodash.isPlainObject = isPlainObject;
        lodash.isRegExp = isRegExp;
        lodash.isString = isString;
        lodash.isTypedArray = isTypedArray;
        lodash.isUndefined = isUndefined;
        lodash.kebabCase = kebabCase;
        lodash.last = last;
        lodash.lastIndexOf = lastIndexOf;
        lodash.lt = lt;
        lodash.lte = lte;
        lodash.max = max;
        lodash.min = min;
        lodash.noConflict = noConflict;
        lodash.noop = noop;
        lodash.now = now;
        lodash.pad = pad;
        lodash.padLeft = padLeft;
        lodash.padRight = padRight;
        lodash.parseInt = parseInt;
        lodash.random = random;
        lodash.reduce = reduce;
        lodash.reduceRight = reduceRight;
        lodash.repeat = repeat;
        lodash.result = result;
        lodash.round = round;
        lodash.runInContext = runInContext;
        lodash.size = size;
        lodash.snakeCase = snakeCase;
        lodash.some = some;
        lodash.sortedIndex = sortedIndex;
        lodash.sortedLastIndex = sortedLastIndex;
        lodash.startCase = startCase;
        lodash.startsWith = startsWith;
        lodash.sum = sum;
        lodash.template = template;
        lodash.trim = trim;
        lodash.trimLeft = trimLeft;
        lodash.trimRight = trimRight;
        lodash.trunc = trunc;
        lodash.unescape = unescape;
        lodash.uniqueId = uniqueId;
        lodash.words = words;
        lodash.all = every;
        lodash.any = some;
        lodash.contains = includes;
        lodash.eq = isEqual;
        lodash.detect = find;
        lodash.foldl = reduce;
        lodash.foldr = reduceRight;
        lodash.head = first;
        lodash.include = includes;
        lodash.inject = reduce;
        mixin(lodash, (function() {
          var source = {};
          baseForOwn(lodash, function(func, methodName) {
            if (!lodash.prototype[methodName]) {
              source[methodName] = func;
            }
          });
          return source;
        }()), false);
        lodash.sample = sample;
        lodash.prototype.sample = function(n) {
          if (!this.__chain__ && n == null) {
            return sample(this.value());
          }
          return this.thru(function(value) {
            return sample(value, n);
          });
        };
        lodash.VERSION = VERSION;
        arrayEach(['bind', 'bindKey', 'curry', 'curryRight', 'partial', 'partialRight'], function(methodName) {
          lodash[methodName].placeholder = lodash;
        });
        arrayEach(['drop', 'take'], function(methodName, index) {
          LazyWrapper.prototype[methodName] = function(n) {
            var filtered = this.__filtered__;
            if (filtered && !index) {
              return new LazyWrapper(this);
            }
            n = n == null ? 1 : nativeMax(nativeFloor(n) || 0, 0);
            var result = this.clone();
            if (filtered) {
              result.__takeCount__ = nativeMin(result.__takeCount__, n);
            } else {
              result.__views__.push({
                'size': n,
                'type': methodName + (result.__dir__ < 0 ? 'Right' : '')
              });
            }
            return result;
          };
          LazyWrapper.prototype[methodName + 'Right'] = function(n) {
            return this.reverse()[methodName](n).reverse();
          };
        });
        arrayEach(['filter', 'map', 'takeWhile'], function(methodName, index) {
          var type = index + 1,
              isFilter = type != LAZY_MAP_FLAG;
          LazyWrapper.prototype[methodName] = function(iteratee, thisArg) {
            var result = this.clone();
            result.__iteratees__.push({
              'iteratee': getCallback(iteratee, thisArg, 1),
              'type': type
            });
            result.__filtered__ = result.__filtered__ || isFilter;
            return result;
          };
        });
        arrayEach(['first', 'last'], function(methodName, index) {
          var takeName = 'take' + (index ? 'Right' : '');
          LazyWrapper.prototype[methodName] = function() {
            return this[takeName](1).value()[0];
          };
        });
        arrayEach(['initial', 'rest'], function(methodName, index) {
          var dropName = 'drop' + (index ? '' : 'Right');
          LazyWrapper.prototype[methodName] = function() {
            return this.__filtered__ ? new LazyWrapper(this) : this[dropName](1);
          };
        });
        arrayEach(['pluck', 'where'], function(methodName, index) {
          var operationName = index ? 'filter' : 'map',
              createCallback = index ? baseMatches : property;
          LazyWrapper.prototype[methodName] = function(value) {
            return this[operationName](createCallback(value));
          };
        });
        LazyWrapper.prototype.compact = function() {
          return this.filter(identity);
        };
        LazyWrapper.prototype.reject = function(predicate, thisArg) {
          predicate = getCallback(predicate, thisArg, 1);
          return this.filter(function(value) {
            return !predicate(value);
          });
        };
        LazyWrapper.prototype.slice = function(start, end) {
          start = start == null ? 0 : (+start || 0);
          var result = this;
          if (result.__filtered__ && (start > 0 || end < 0)) {
            return new LazyWrapper(result);
          }
          if (start < 0) {
            result = result.takeRight(-start);
          } else if (start) {
            result = result.drop(start);
          }
          if (end !== undefined) {
            end = (+end || 0);
            result = end < 0 ? result.dropRight(-end) : result.take(end - start);
          }
          return result;
        };
        LazyWrapper.prototype.takeRightWhile = function(predicate, thisArg) {
          return this.reverse().takeWhile(predicate, thisArg).reverse();
        };
        LazyWrapper.prototype.toArray = function() {
          return this.take(POSITIVE_INFINITY);
        };
        baseForOwn(LazyWrapper.prototype, function(func, methodName) {
          var checkIteratee = /^(?:filter|map|reject)|While$/.test(methodName),
              retUnwrapped = /^(?:first|last)$/.test(methodName),
              lodashFunc = lodash[retUnwrapped ? ('take' + (methodName == 'last' ? 'Right' : '')) : methodName];
          if (!lodashFunc) {
            return;
          }
          lodash.prototype[methodName] = function() {
            var args = retUnwrapped ? [1] : arguments,
                chainAll = this.__chain__,
                value = this.__wrapped__,
                isHybrid = !!this.__actions__.length,
                isLazy = value instanceof LazyWrapper,
                iteratee = args[0],
                useLazy = isLazy || isArray(value);
            if (useLazy && checkIteratee && typeof iteratee == 'function' && iteratee.length != 1) {
              isLazy = useLazy = false;
            }
            var interceptor = function(value) {
              return (retUnwrapped && chainAll) ? lodashFunc(value, 1)[0] : lodashFunc.apply(undefined, arrayPush([value], args));
            };
            var action = {
              'func': thru,
              'args': [interceptor],
              'thisArg': undefined
            },
                onlyLazy = isLazy && !isHybrid;
            if (retUnwrapped && !chainAll) {
              if (onlyLazy) {
                value = value.clone();
                value.__actions__.push(action);
                return func.call(value);
              }
              return lodashFunc.call(undefined, this.value())[0];
            }
            if (!retUnwrapped && useLazy) {
              value = onlyLazy ? value : new LazyWrapper(this);
              var result = func.apply(value, args);
              result.__actions__.push(action);
              return new LodashWrapper(result, chainAll);
            }
            return this.thru(interceptor);
          };
        });
        arrayEach(['join', 'pop', 'push', 'replace', 'shift', 'sort', 'splice', 'split', 'unshift'], function(methodName) {
          var func = (/^(?:replace|split)$/.test(methodName) ? stringProto : arrayProto)[methodName],
              chainName = /^(?:push|sort|unshift)$/.test(methodName) ? 'tap' : 'thru',
              retUnwrapped = /^(?:join|pop|replace|shift)$/.test(methodName);
          lodash.prototype[methodName] = function() {
            var args = arguments;
            if (retUnwrapped && !this.__chain__) {
              return func.apply(this.value(), args);
            }
            return this[chainName](function(value) {
              return func.apply(value, args);
            });
          };
        });
        baseForOwn(LazyWrapper.prototype, function(func, methodName) {
          var lodashFunc = lodash[methodName];
          if (lodashFunc) {
            var key = lodashFunc.name,
                names = realNames[key] || (realNames[key] = []);
            names.push({
              'name': methodName,
              'func': lodashFunc
            });
          }
        });
        realNames[createHybridWrapper(undefined, BIND_KEY_FLAG).name] = [{
          'name': 'wrapper',
          'func': undefined
        }];
        LazyWrapper.prototype.clone = lazyClone;
        LazyWrapper.prototype.reverse = lazyReverse;
        LazyWrapper.prototype.value = lazyValue;
        lodash.prototype.chain = wrapperChain;
        lodash.prototype.commit = wrapperCommit;
        lodash.prototype.concat = wrapperConcat;
        lodash.prototype.plant = wrapperPlant;
        lodash.prototype.reverse = wrapperReverse;
        lodash.prototype.toString = wrapperToString;
        lodash.prototype.run = lodash.prototype.toJSON = lodash.prototype.valueOf = lodash.prototype.value = wrapperValue;
        lodash.prototype.collect = lodash.prototype.map;
        lodash.prototype.head = lodash.prototype.first;
        lodash.prototype.select = lodash.prototype.filter;
        lodash.prototype.tail = lodash.prototype.rest;
        return lodash;
      }
      var _ = runInContext();
      if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
        root._ = _;
        define(function() {
          return _;
        });
      } else if (freeExports && freeModule) {
        if (moduleExports) {
          (freeModule.exports = _)._ = _;
        } else {
          freeExports._ = _;
        }
      } else {
        root._ = _;
      }
    }.call(this));
  })(require("github:jspm/nodelibs-process@0.1.2.js"));
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/fn/map.js", ["npm:core-js@0.9.18/library/modules/es6.object.to-string.js", "npm:core-js@0.9.18/library/modules/es6.string.iterator.js", "npm:core-js@0.9.18/library/modules/web.dom.iterable.js", "npm:core-js@0.9.18/library/modules/es6.map.js", "npm:core-js@0.9.18/library/modules/es7.map.to-json.js", "npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.18/library/modules/es6.object.to-string.js");
  require("npm:core-js@0.9.18/library/modules/es6.string.iterator.js");
  require("npm:core-js@0.9.18/library/modules/web.dom.iterable.js");
  require("npm:core-js@0.9.18/library/modules/es6.map.js");
  require("npm:core-js@0.9.18/library/modules/es7.map.to-json.js");
  module.exports = require("npm:core-js@0.9.18/library/modules/$.js").core.Map;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/core-js/promise.js", ["npm:core-js@0.9.18/library/fn/promise.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/promise.js"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/helpers/inherits.js", ["npm:babel-runtime@5.8.25/core-js/object/create.js", "npm:babel-runtime@5.8.25/core-js/object/set-prototype-of.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  "use strict";
  var _Object$create = require("npm:babel-runtime@5.8.25/core-js/object/create.js")["default"];
  var _Object$setPrototypeOf = require("npm:babel-runtime@5.8.25/core-js/object/set-prototype-of.js")["default"];
  exports["default"] = function(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
      throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
    }
    subClass.prototype = _Object$create(superClass && superClass.prototype, {constructor: {
        value: subClass,
        enumerable: false,
        writable: true,
        configurable: true
      }});
    if (superClass)
      _Object$setPrototypeOf ? _Object$setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
  };
  exports.__esModule = true;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/modules/web.dom.iterable.js", ["npm:core-js@0.9.18/library/modules/es6.array.iterator.js", "npm:core-js@0.9.18/library/modules/$.js", "npm:core-js@0.9.18/library/modules/$.iter.js", "npm:core-js@0.9.18/library/modules/$.wks.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.18/library/modules/es6.array.iterator.js");
  var $ = require("npm:core-js@0.9.18/library/modules/$.js"),
      Iterators = require("npm:core-js@0.9.18/library/modules/$.iter.js").Iterators,
      ITERATOR = require("npm:core-js@0.9.18/library/modules/$.wks.js")('iterator'),
      ArrayValues = Iterators.Array,
      NL = $.g.NodeList,
      HTC = $.g.HTMLCollection,
      NLProto = NL && NL.prototype,
      HTCProto = HTC && HTC.prototype;
  if ($.FW) {
    if (NL && !(ITERATOR in NLProto))
      $.hide(NLProto, ITERATOR, ArrayValues);
    if (HTC && !(ITERATOR in HTCProto))
      $.hide(HTCProto, ITERATOR, ArrayValues);
  }
  Iterators.NodeList = Iterators.HTMLCollection = ArrayValues;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:lodash@3.10.1.js", ["npm:lodash@3.10.1/index.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = require("npm:lodash@3.10.1/index.js");
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/core-js/map.js", ["npm:core-js@0.9.18/library/fn/map.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/map.js"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:core-js@0.9.18/library/fn/get-iterator.js", ["npm:core-js@0.9.18/library/modules/web.dom.iterable.js", "npm:core-js@0.9.18/library/modules/es6.string.iterator.js", "npm:core-js@0.9.18/library/modules/core.iter-helpers.js", "npm:core-js@0.9.18/library/modules/$.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  require("npm:core-js@0.9.18/library/modules/web.dom.iterable.js");
  require("npm:core-js@0.9.18/library/modules/es6.string.iterator.js");
  require("npm:core-js@0.9.18/library/modules/core.iter-helpers.js");
  module.exports = require("npm:core-js@0.9.18/library/modules/$.js").core.getIterator;
  global.define = __define;
  return module.exports;
});

System.registerDynamic("npm:babel-runtime@5.8.25/core-js/get-iterator.js", ["npm:core-js@0.9.18/library/fn/get-iterator.js"], true, function(require, exports, module) {
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": require("npm:core-js@0.9.18/library/fn/get-iterator.js"),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

System.register('github:Bizboard/di.js@master/profiler.js', ['npm:babel-runtime@5.8.25/core-js/map.js', 'github:Bizboard/di.js@master/util.js'], function (_export) {
  var _Map, toString, IS_DEBUG, _global, globalCounter;

  function getUniqueId() {
    return ++globalCounter;
  }

  function serializeToken(token, tokens) {
    if (!tokens.has(token)) {
      tokens.set(token, getUniqueId().toString());
    }

    return tokens.get(token);
  }

  function serializeProvider(provider, key, tokens) {
    return {
      id: serializeToken(key, tokens),
      name: toString(key),
      isPromise: provider.isPromise,
      dependencies: provider.params.map(function (param) {
        return {
          token: serializeToken(param.token, tokens),
          isPromise: param.isPromise,
          isLazy: param.isLazy
        };
      })
    };
  }

  function serializeInjector(injector, tokens, Injector) {
    var serializedInjector = {
      id: serializeToken(injector, tokens),
      parent_id: injector._parent ? serializeToken(injector._parent, tokens) : null,
      providers: {}
    };

    var injectorClassId = serializeToken(Injector, tokens);
    serializedInjector.providers[injectorClassId] = {
      id: injectorClassId,
      name: toString(Injector),
      isPromise: false,
      dependencies: []
    };

    injector._providers.forEach(function (provider, key) {
      var serializedProvider = serializeProvider(provider, key, tokens);
      serializedInjector.providers[serializedProvider.id] = serializedProvider;
    });

    return serializedInjector;
  }

  function profileInjector(injector, Injector) {
    if (!IS_DEBUG) {
      return;
    }

    if (!_global.__di_dump__) {
      _global.__di_dump__ = {
        injectors: [],
        tokens: new _Map()
      };
    }

    _global.__di_dump__.injectors.push(serializeInjector(injector, _global.__di_dump__.tokens, Injector));
  }

  return {
    setters: [function (_npmBabelRuntime5825CoreJsMapJs) {
      _Map = _npmBabelRuntime5825CoreJsMapJs['default'];
    }, function (_githubBizboardDiJsMasterUtilJs) {
      toString = _githubBizboardDiJsMasterUtilJs.toString;
    }],
    execute: function () {
      /* */
      'use strict';

      _export('profileInjector', profileInjector);

      IS_DEBUG = false;
      _global = null;

      if (typeof process === 'object' && process.env) {
        // Node.js
        IS_DEBUG = !!process.env['DEBUG'];
        _global = global;
      } else if (typeof location === 'object' && location.search) {
        // Browser
        IS_DEBUG = /di_debug/.test(location.search);
        _global = window;
      }

      globalCounter = 0;
    }
  };
});
System.register('github:Bizboard/di.js@master/providers.js', ['npm:babel-runtime@5.8.25/helpers/create-class.js', 'npm:babel-runtime@5.8.25/helpers/class-call-check.js', 'npm:babel-runtime@5.8.25/core-js/get-iterator.js', 'npm:babel-runtime@5.8.25/core-js/object/create.js', 'github:Bizboard/di.js@master/annotations.js', 'github:Bizboard/di.js@master/util.js'], function (_export) {
  var _createClass, _classCallCheck, _getIterator, _Object$create, ClassProviderAnnotation, FactoryProviderAnnotation, SuperConstructorAnnotation, readAnnotations, hasAnnotation, isFunction, isObject, toString, isUpperCase, ownKeys, EmptyFunction, ClassProvider, FactoryProvider;

  function isClass(clsOrFunction) {

    if (hasAnnotation(clsOrFunction, ClassProviderAnnotation)) {
      return true;
    } else if (hasAnnotation(clsOrFunction, FactoryProviderAnnotation)) {
      return false;
    } else if (clsOrFunction.name) {
      return isUpperCase(clsOrFunction.name.charAt(0));
    } else {
      return ownKeys(clsOrFunction.prototype).length > 0;
    }
  }

  // Provider is responsible for creating instances.
  //
  // responsibilities:
  // - create instances
  //
  // communication:
  // - exposes `create()` which creates an instance of something
  // - exposes `params` (information about which arguments it requires to be passed into `create()`)
  //
  // Injector reads `provider.params` first, create these dependencies (however it wants),
  // then calls `provider.create(args)`, passing in these arguments.

  function createProviderFromFnOrClass(fnOrClass, annotations) {
    if (isClass(fnOrClass)) {
      return new ClassProvider(fnOrClass, annotations.params, annotations.provide.isPromise);
    }

    return new FactoryProvider(fnOrClass, annotations.params, annotations.provide.isPromise);
  }

  return {
    setters: [function (_npmBabelRuntime5825HelpersCreateClassJs) {
      _createClass = _npmBabelRuntime5825HelpersCreateClassJs['default'];
    }, function (_npmBabelRuntime5825HelpersClassCallCheckJs) {
      _classCallCheck = _npmBabelRuntime5825HelpersClassCallCheckJs['default'];
    }, function (_npmBabelRuntime5825CoreJsGetIteratorJs) {
      _getIterator = _npmBabelRuntime5825CoreJsGetIteratorJs['default'];
    }, function (_npmBabelRuntime5825CoreJsObjectCreateJs) {
      _Object$create = _npmBabelRuntime5825CoreJsObjectCreateJs['default'];
    }, function (_githubBizboardDiJsMasterAnnotationsJs) {
      ClassProviderAnnotation = _githubBizboardDiJsMasterAnnotationsJs.ClassProvider;
      FactoryProviderAnnotation = _githubBizboardDiJsMasterAnnotationsJs.FactoryProvider;
      SuperConstructorAnnotation = _githubBizboardDiJsMasterAnnotationsJs.SuperConstructor;
      readAnnotations = _githubBizboardDiJsMasterAnnotationsJs.readAnnotations;
      hasAnnotation = _githubBizboardDiJsMasterAnnotationsJs.hasAnnotation;
    }, function (_githubBizboardDiJsMasterUtilJs) {
      isFunction = _githubBizboardDiJsMasterUtilJs.isFunction;
      isObject = _githubBizboardDiJsMasterUtilJs.isObject;
      toString = _githubBizboardDiJsMasterUtilJs.toString;
      isUpperCase = _githubBizboardDiJsMasterUtilJs.isUpperCase;
      ownKeys = _githubBizboardDiJsMasterUtilJs.ownKeys;
    }],
    execute: function () {
      /* */
      'use strict';

      _export('createProviderFromFnOrClass', createProviderFromFnOrClass);

      EmptyFunction = Object.getPrototypeOf(Function);

      // ClassProvider knows how to instantiate classes.
      //
      // If a class inherits (has parent constructors), this provider normalizes all the dependencies
      // into a single flat array first, so that the injector does not need to worry about inheritance.
      //
      // - all the state is immutable (constructed)
      //
      // TODO(vojta): super constructor - should be only allowed during the constructor call?

      ClassProvider = (function () {
        function ClassProvider(clazz, params, isPromise) {
          _classCallCheck(this, ClassProvider);

          // TODO(vojta): can we hide this.provider? (only used for hasAnnotation(provider.provider))
          this.provider = clazz;
          this.isPromise = isPromise;

          this.params = [];
          this._constructors = [];

          this._flattenParams(clazz, params);
          this._constructors.unshift([clazz, 0, this.params.length - 1]);
        }

        // FactoryProvider knows how to create instance from a factory function.
        // - all the state is immutable

        // Normalize params for all the constructors (in the case of inheritance),
        // into a single flat array of DependencyDescriptors.
        // So that the injector does not have to worry about inheritance.
        //
        // This function mutates `this.params` and `this._constructors`,
        // but it is only called during the constructor.
        // TODO(vojta): remove the annotations argument?

        _createClass(ClassProvider, [{
          key: '_flattenParams',
          value: function _flattenParams(constructor, params) {
            var SuperConstructor;
            var constructorInfo;

            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
              for (var _iterator = _getIterator(params), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                var param = _step.value;

                if (param.token === SuperConstructorAnnotation) {
                  SuperConstructor = Object.getPrototypeOf(constructor);

                  if (SuperConstructor === EmptyFunction) {
                    throw new Error(toString(constructor) + ' does not have a parent constructor. Only classes with a parent can ask for SuperConstructor!');
                  }

                  constructorInfo = [SuperConstructor, this.params.length];
                  this._constructors.push(constructorInfo);
                  this._flattenParams(SuperConstructor, readAnnotations(SuperConstructor).params);
                  constructorInfo.push(this.params.length - 1);
                } else {
                  this.params.push(param);
                }
              }
            } catch (err) {
              _didIteratorError = true;
              _iteratorError = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion && _iterator['return']) {
                  _iterator['return']();
                }
              } finally {
                if (_didIteratorError) {
                  throw _iteratorError;
                }
              }
            }
          }

          // Basically the reverse process to `this._flattenParams`:
          // We get arguments for all the constructors as a single flat array.
          // This method generates pre-bound "superConstructor" wrapper with correctly passing arguments.
        }, {
          key: '_createConstructor',
          value: function _createConstructor(currentConstructorIdx, context, allArguments) {
            var constructorInfo = this._constructors[currentConstructorIdx];
            var nextConstructorInfo = this._constructors[currentConstructorIdx + 1];
            var argsForCurrentConstructor;

            if (nextConstructorInfo) {
              argsForCurrentConstructor = allArguments.slice(constructorInfo[1], nextConstructorInfo[1]).concat([this._createConstructor(currentConstructorIdx + 1, context, allArguments)]).concat(allArguments.slice(nextConstructorInfo[2] + 1, constructorInfo[2] + 1));
            } else {
              argsForCurrentConstructor = allArguments.slice(constructorInfo[1], constructorInfo[2] + 1);
            }

            return function InjectedAndBoundSuperConstructor() {
              // TODO(vojta): throw if arguments given
              return constructorInfo[0].apply(context, argsForCurrentConstructor);
            };
          }

          // It is called by injector to create an instance.
        }, {
          key: 'create',
          value: function create(args) {
            var context = _Object$create(this.provider.prototype);
            var constructor = this._createConstructor(0, context, args);
            var returnedValue = constructor();

            if (isFunction(returnedValue) || isObject(returnedValue)) {
              return returnedValue;
            }

            return context;
          }
        }]);

        return ClassProvider;
      })();

      FactoryProvider = (function () {
        function FactoryProvider(factoryFunction, params, isPromise) {
          _classCallCheck(this, FactoryProvider);

          this.provider = factoryFunction;
          this.params = params;
          this.isPromise = isPromise;

          var _iteratorNormalCompletion2 = true;
          var _didIteratorError2 = false;
          var _iteratorError2 = undefined;

          try {
            for (var _iterator2 = _getIterator(params), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
              var param = _step2.value;

              if (param.token === SuperConstructorAnnotation) {
                throw new Error(toString(factoryFunction) + ' is not a class. Only classes with a parent can ask for SuperConstructor!');
              }
            }
          } catch (err) {
            _didIteratorError2 = true;
            _iteratorError2 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion2 && _iterator2['return']) {
                _iterator2['return']();
              }
            } finally {
              if (_didIteratorError2) {
                throw _iteratorError2;
              }
            }
          }
        }

        _createClass(FactoryProvider, [{
          key: 'create',
          value: function create(args) {
            return this.provider.apply(undefined, args);
          }
        }]);

        return FactoryProvider;
      })();
    }
  };
});
System.register('github:bizboard/arva-utils@1.0.0-beta-2/request/UrlParser.js', [], function (_export) {
    /**
     This Source Code is licensed under the MIT license. If a copy of the
     MIT-license was not distributed with this file, You can obtain one at:
     http://opensource.org/licenses/mit-license.html.
    
     @author: Hans van den Akker (mysim1)
     @license MIT
     @copyright Bizboard, 2015
    
     */

    'use strict';

    _export('UrlParser', UrlParser);

    function UrlParser(url) {

        var e = /^([a-z][a-z0-9+.-]*):(?:\/\/((?:(?=((?:[a-z0-9-._~!$&'()*+,;=:]|%[0-9A-F]{2})*))(\3)@)?(?=(\[[0-9A-F:.]{2,}\]|(?:[a-z0-9-._~!$&'()*+,;=]|%[0-9A-F]{2})*))\5(?::(?=(\d*))\6)?)(\/(?=((?:[a-z0-9-._~!$&'()*+,;=:@\/]|%[0-9A-F]{2})*))\8)?|(\/?(?!\/)(?=((?:[a-z0-9-._~!$&'()*+,;=:@\/]|%[0-9A-F]{2})*))\10)?)(?:\?(?=((?:[a-z0-9-._~!$&'()*+,;=:@\/?]|%[0-9A-F]{2})*))\11)?(?:#(?=((?:[a-z0-9-._~!$&'()*+,;=:@\/?]|%[0-9A-F]{2})*))\12)?$/i;

        if (url.match(e)) {
            return {
                url: RegExp['$&'],
                protocol: RegExp.$1,
                host: RegExp.$2,
                path: RegExp.$8,
                hash: RegExp.$12
            };
        } else {
            return null;
        }
    }

    return {
        setters: [],
        execute: function () {}
    };
});
System.register('github:bizboard/SPSoapAdapter@1.0.0-beta-2/Settings.js', ['npm:babel-runtime@5.8.25/helpers/create-class.js', 'npm:babel-runtime@5.8.25/helpers/class-call-check.js'], function (_export) {
  var _createClass, _classCallCheck, Settings;

  return {
    setters: [function (_npmBabelRuntime5825HelpersCreateClassJs) {
      _createClass = _npmBabelRuntime5825HelpersCreateClassJs['default'];
    }, function (_npmBabelRuntime5825HelpersClassCallCheckJs) {
      _classCallCheck = _npmBabelRuntime5825HelpersClassCallCheckJs['default'];
    }],
    execute: function () {
      /**
       * Created by tom on 20/11/15.
       */

      'use strict';

      Settings = (function () {
        function Settings() {
          _classCallCheck(this, Settings);
        }

        _createClass(Settings, null, [{
          key: 'localKeyPrefix',
          get: function get() {
            return '_local_';
          }
        }]);

        return Settings;
      })();

      _export('Settings', Settings);
    }
  };
});
System.register('github:bizboard/arva-utils@1.0.0-beta-2/BlobHelper.js', ['npm:babel-runtime@5.8.25/helpers/create-class.js', 'npm:babel-runtime@5.8.25/helpers/class-call-check.js'], function (_export) {
    var _createClass, _classCallCheck, BlobHelper;

    return {
        setters: [function (_npmBabelRuntime5825HelpersCreateClassJs) {
            _createClass = _npmBabelRuntime5825HelpersCreateClassJs['default'];
        }, function (_npmBabelRuntime5825HelpersClassCallCheckJs) {
            _classCallCheck = _npmBabelRuntime5825HelpersClassCallCheckJs['default'];
        }],
        execute: function () {
            /**
             This Source Code is licensed under the MIT license. If a copy of the
             MIT-license was not distributed with this file, You can obtain one at:
             http://opensource.org/licenses/mit-license.html.
            
             @author: Hans van den Akker (mysim1)
             @license MIT
             @copyright Bizboard, 2015
            
             */

            'use strict';

            BlobHelper = (function () {
                function BlobHelper() {
                    _classCallCheck(this, BlobHelper);
                }

                _createClass(BlobHelper, null, [{
                    key: 'base64toBlob',

                    /**
                     * Convert base64 string data to a HTML5 Blob object.
                     * @param {String} b64Data Base64 data to convert to Blob
                     * @param {String} contentType Content type
                     * @param {Number} sliceSize How large the chunks are in which we process the data.
                     * @returns {Blob} Blob of raw data.
                     */
                    value: function base64toBlob(b64Data, contentType, sliceSize) {
                        contentType = contentType || '';
                        sliceSize = sliceSize || 512;

                        var byteCharacters = atob(b64Data);
                        var byteCharLength = byteCharacters.length;
                        var byteArrays = [];

                        for (var offset = 0; offset < byteCharLength; offset += sliceSize) {
                            var slice = byteCharacters.slice(offset, offset + sliceSize);
                            var sliceLength = slice.length;
                            var byteNumbers = new Array(sliceLength);
                            for (var i = 0; i < sliceLength; i++) {
                                byteNumbers[i] = slice.charCodeAt(i);
                            }

                            var byteArray = new Uint8Array(byteNumbers);

                            byteArrays.push(byteArray);
                        }

                        var blob = new Blob(byteArrays, { type: contentType });
                        return blob;
                    }
                }]);

                return BlobHelper;
            })();

            _export('BlobHelper', BlobHelper);
        }
    };
});
System.register("src/core/Snapshot.js", ["npm:babel-runtime@5.8.25/helpers/create-class.js", "npm:babel-runtime@5.8.25/helpers/class-call-check.js"], function (_export) {
  var _createClass, _classCallCheck, Snapshot;

  return {
    setters: [function (_npmBabelRuntime5825HelpersCreateClassJs) {
      _createClass = _npmBabelRuntime5825HelpersCreateClassJs["default"];
    }, function (_npmBabelRuntime5825HelpersClassCallCheckJs) {
      _classCallCheck = _npmBabelRuntime5825HelpersClassCallCheckJs["default"];
    }],
    execute: function () {
      /**
       This Source Code is licensed under the MIT license. If a copy of the
       MIT-license was not distributed with this file, You can obtain one at:
       http://opensource.org/licenses/mit-license.html.
      
      
       @author: Tom Clement (tjclement)
       @license MIT
       @copyright Bizboard, 2015
      
       */

      "use strict";

      Snapshot = (function () {
        function Snapshot(dataSnapshot) {
          _classCallCheck(this, Snapshot);
        }

        _createClass(Snapshot, [{
          key: "key",
          value: function key() {}
        }, {
          key: "val",
          value: function val() {}
        }, {
          key: "ref",
          value: function ref() {}
        }, {
          key: "getPriority",
          value: function getPriority() {}
        }, {
          key: "forEach",
          value: function forEach() {}
        }, {
          key: "numChildren",
          value: function numChildren() {}
        }]);

        return Snapshot;
      })();

      _export("Snapshot", Snapshot);
    }
  };
});
System.register('github:bizboard/SPSoapAdapter@1.0.0-beta-2/SharePoint.js', ['npm:babel-runtime@5.8.25/helpers/get.js', 'npm:babel-runtime@5.8.25/helpers/inherits.js', 'npm:babel-runtime@5.8.25/helpers/create-class.js', 'npm:babel-runtime@5.8.25/helpers/class-call-check.js', 'npm:babel-runtime@5.8.25/helpers/slice.js', 'npm:lodash@3.10.1.js', 'npm:eventemitter3@1.1.1.js', 'github:bizboard/SPSoapAdapter@1.0.0-beta-2/Settings.js', 'github:bizboard/arva-utils@1.0.0-beta-2/request/UrlParser.js', 'github:bizboard/arva-utils@1.0.0-beta-2/ObjectHelper.js', 'github:bizboard/arva-utils@1.0.0-beta-2/BlobHelper.js'], function (_export) {
    var _get, _inherits, _createClass, _classCallCheck, _slice, _, EventEmitter, Settings, UrlParser, ObjectHelper, BlobHelper, DEBUG_WORKER, SPWorker, workerEvents, SharePoint;

    return {
        setters: [function (_npmBabelRuntime5825HelpersGetJs) {
            _get = _npmBabelRuntime5825HelpersGetJs['default'];
        }, function (_npmBabelRuntime5825HelpersInheritsJs) {
            _inherits = _npmBabelRuntime5825HelpersInheritsJs['default'];
        }, function (_npmBabelRuntime5825HelpersCreateClassJs) {
            _createClass = _npmBabelRuntime5825HelpersCreateClassJs['default'];
        }, function (_npmBabelRuntime5825HelpersClassCallCheckJs) {
            _classCallCheck = _npmBabelRuntime5825HelpersClassCallCheckJs['default'];
        }, function (_npmBabelRuntime5825HelpersSliceJs) {
            _slice = _npmBabelRuntime5825HelpersSliceJs['default'];
        }, function (_npmLodash3101Js) {
            _ = _npmLodash3101Js['default'];
        }, function (_npmEventemitter3111Js) {
            EventEmitter = _npmEventemitter3111Js['default'];
        }, function (_githubBizboardSPSoapAdapter100Beta2SettingsJs) {
            Settings = _githubBizboardSPSoapAdapter100Beta2SettingsJs.Settings;
        }, function (_githubBizboardArvaUtils100Beta2RequestUrlParserJs) {
            UrlParser = _githubBizboardArvaUtils100Beta2RequestUrlParserJs.UrlParser;
        }, function (_githubBizboardArvaUtils100Beta2ObjectHelperJs) {
            ObjectHelper = _githubBizboardArvaUtils100Beta2ObjectHelperJs.ObjectHelper;
        }, function (_githubBizboardArvaUtils100Beta2BlobHelperJs) {
            BlobHelper = _githubBizboardArvaUtils100Beta2BlobHelperJs.BlobHelper;
        }],
        execute: function () {
            /**
             * Created by mysim1 on 13/06/15.
             */

            'use strict';

            DEBUG_WORKER = true;
            SPWorker = new Worker('worker.js');
            workerEvents = new EventEmitter();

            SPWorker.onmessage = function (messageEvent) {
                workerEvents.emit('message', messageEvent);
            };

            /**
             * The SharePoint class will utilize a Web Worker to perform data operations. Running the data interfacing in a
             * seperate thread from the UI thread will ensure there is minimal interruption of the user interaction.
             */

            SharePoint = (function (_EventEmitter) {
                _inherits(SharePoint, _EventEmitter);

                function SharePoint() {
                    var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

                    _classCallCheck(this, SharePoint);

                    _get(Object.getPrototypeOf(SharePoint.prototype), 'constructor', this).call(this);

                    ObjectHelper.bindAllMethods(this, this);

                    var endpoint = UrlParser(options.endPoint);
                    if (!endpoint) throw Error('Invalid configuration.');

                    this.subscriberID = SharePoint.hashCode(endpoint.path + JSON.stringify(options.query) + options.orderBy + options.limit);
                    this.options = options;
                    this.cache = null;

                    workerEvents.on('message', this._onMessage.bind(this));
                }

                _createClass(SharePoint, [{
                    key: 'getAuth',
                    value: function getAuth(callback) {
                        var _this = this;

                        var context = arguments.length <= 1 || arguments[1] === undefined ? this : arguments[1];

                        _get(Object.getPrototypeOf(SharePoint.prototype), 'once', this).call(this, 'auth_result', function (authData) {
                            return _this._handleAuthResult(authData, callback, context);
                        });

                        /* Grab any existing cached data for this path. There will be data if there are other
                         * subscribers on the same path already. */
                        SPWorker.postMessage(_.extend({}, this.options, {
                            subscriberID: this.subscriberID,
                            endPoint: this.options.endPoint,
                            operation: 'get_auth'
                        }));
                    }
                }, {
                    key: 'once',
                    value: function once(event, handler) {
                        var context = arguments.length <= 2 || arguments[2] === undefined ? this : arguments[2];

                        this.on(event, (function () {
                            handler.call.apply(handler, [context].concat(_slice.call(arguments)));
                            this.off(event, handler, context);
                        }).bind(this), context);
                    }
                }, {
                    key: 'on',
                    value: function on(event, handler) {
                        var _this2 = this;

                        var context = arguments.length <= 2 || arguments[2] === undefined ? this : arguments[2];

                        /* Hold off on initialising the actual SharePoint connection until someone actually subscribes to data changes. */
                        if (!this._initialised) {
                            this._initialise();
                            this._initialised = true;
                        }

                        /* Fix to make Arva-ds PrioArray.add() work, by immediately returning the model data with an ID when the model is created. */
                        if (!this._ready && this.cache && event === 'value') {
                            handler.call(context, this.cache);
                        }

                        if (this._ready && event === 'value' || event === 'child_added') {
                            this.once('cache_data', function (cacheData) {
                                return _this2._handleCacheData(cacheData, event, handler, context);
                            });

                            /* Grab any existing cached data for this path. There will be data if there are other
                             * subscribers on the same path already. */
                            SPWorker.postMessage(_.extend({}, this.options, {
                                subscriberID: this.subscriberID,
                                operation: 'get_cache'
                            }));
                        }

                        /* Tell the SharePoint worker that we want to be subscribed to changes from now on (can be called multiple times) */
                        SPWorker.postMessage(_.extend({}, this.options, {
                            subscriberID: this.subscriberID,
                            operation: 'subscribe'
                        }));

                        _get(Object.getPrototypeOf(SharePoint.prototype), 'on', this).call(this, event, handler, context);
                    }
                }, {
                    key: 'off',
                    value: function off(event, handler) {
                        var amountRemoved = undefined;
                        if (event && handler) {
                            this.removeListener(event, handler);
                            amountRemoved = 1;
                        } else {
                            this.removeAllListeners(event);
                            amountRemoved = this.listeners(event).length;
                        }

                        for (var i = 0; i < amountRemoved; i++) {
                            /* Tell the Manager that this subscription is cancelled and no longer requires refreshed data from SharePoint. */
                            SPWorker.postMessage(_.extend({}, this.options, {
                                subscriberID: this.subscriberID,
                                operation: 'dispose'
                            }));
                        }
                    }
                }, {
                    key: 'set',
                    value: function set(model) {
                        /* Hold off on initialising the actual SharePoint connection until someone actually subscribes to data changes. */
                        if (!this._initialised) {
                            this._initialise();
                            this._initialised = true;
                        }

                        /* If there is no ID, make a temporary ID for reference in the main thread for the session scope. */
                        var modelId = model.id;
                        if (!modelId || modelId === 0) {
                            model['_temporary-identifier'] = '' + Settings.localKeyPrefix + Math.floor(Math.random() * 2000000000);
                        }

                        SPWorker.postMessage({
                            subscriberID: this.subscriberID,
                            endPoint: this.options.endPoint,
                            listName: this.options.listName,
                            operation: 'set',
                            model: model
                        });

                        if (model['_temporary-identifier']) {
                            /* Set the model's ID to the temporary one so it can be used to query the dataSource with. */
                            if (model.disableChangeListener) {
                                model.disableChangeListener();
                            }
                            model.id = model['_temporary-identifier'];
                            if (model.enableChangeListener) {
                                model.enableChangeListener();
                            }
                        }

                        /* Cache is used to immediately trigger the value callback if a new model was created and subscribes to its own changes. */
                        this.cache = model;
                        return model;
                    }
                }, {
                    key: 'remove',
                    value: function remove(model) {
                        SPWorker.postMessage({
                            subscriberID: this.subscriberID,
                            endPoint: this.options.endPoint,
                            listName: this.options.listName,
                            operation: 'remove',
                            model: model
                        });
                    }
                }, {
                    key: '_initialise',
                    value: function _initialise() {
                        var _this3 = this;

                        _get(Object.getPrototypeOf(SharePoint.prototype), 'once', this).call(this, 'value', function () {
                            _this3._ready = true;
                        });

                        /* Initialise the worker */
                        SPWorker.postMessage(_.extend({}, this.options, {
                            subscriberID: this.subscriberID,
                            operation: 'init'
                        }));
                    }
                }, {
                    key: '_onMessage',
                    value: function _onMessage(messageEvent) {
                        var message = messageEvent.data;
                        /* Ignore messages not meant for this SharePoint instance. */
                        if (message.subscriberID !== this.subscriberID) {
                            return;
                        }

                        if (message.event === 'cache_data') {
                            this.emit('cache_data', message.cache);
                        } else if (message.event === 'auth_result') {
                            this.emit('auth_result', message.auth);
                        } else if (message.event !== 'INVALIDSTATE') {
                            this.emit(message.event, message.result, message.previousSiblingId);
                        } else {
                            console.log("Worker Error:", message.result);
                        }
                    }
                }, {
                    key: '_handleCacheData',
                    value: function _handleCacheData(cacheData, event, handler, context) {
                        if (!cacheData) {
                            cacheData = [];
                        }

                        if (event === 'child_added') {
                            for (var index = 0; index < cacheData.length; index++) {
                                var child = cacheData[index];
                                var previousChildID = index > 0 ? cacheData[index - 1] : null;
                                handler.call(context, child, previousChildID);
                            }
                        } else if (event === 'value') {
                            handler.call(context, cacheData.length ? cacheData : null);
                        }
                    }
                }, {
                    key: '_handleAuthResult',
                    value: function _handleAuthResult(authData, handler) {
                        var context = arguments.length <= 2 || arguments[2] === undefined ? this : arguments[2];

                        if (!authData) {
                            authData = {};
                        }

                        handler.call(context, authData);
                    }
                }], [{
                    key: 'hashCode',
                    value: function hashCode(s) {
                        return s.split("").reduce(function (a, b) {
                            a = (a << 5) - a + b.charCodeAt(0);
                            return a & a;
                        }, 0);
                    }
                }]);

                return SharePoint;
            })(EventEmitter);

            _export('SharePoint', SharePoint);
        }
    };
});
System.register('src/datasources/SharePoint/SharePointSnapshot.js', ['npm:babel-runtime@5.8.25/helpers/get.js', 'npm:babel-runtime@5.8.25/helpers/inherits.js', 'npm:babel-runtime@5.8.25/helpers/create-class.js', 'npm:babel-runtime@5.8.25/helpers/class-call-check.js', 'npm:babel-runtime@5.8.25/core-js/get-iterator.js', 'github:bizboard/arva-utils@1.0.0-beta-2/ObjectHelper.js', 'src/core/Snapshot.js'], function (_export) {
    var _get, _inherits, _createClass, _classCallCheck, _getIterator, ObjectHelper, Snapshot, SharePointSnapshot;

    return {
        setters: [function (_npmBabelRuntime5825HelpersGetJs) {
            _get = _npmBabelRuntime5825HelpersGetJs['default'];
        }, function (_npmBabelRuntime5825HelpersInheritsJs) {
            _inherits = _npmBabelRuntime5825HelpersInheritsJs['default'];
        }, function (_npmBabelRuntime5825HelpersCreateClassJs) {
            _createClass = _npmBabelRuntime5825HelpersCreateClassJs['default'];
        }, function (_npmBabelRuntime5825HelpersClassCallCheckJs) {
            _classCallCheck = _npmBabelRuntime5825HelpersClassCallCheckJs['default'];
        }, function (_npmBabelRuntime5825CoreJsGetIteratorJs) {
            _getIterator = _npmBabelRuntime5825CoreJsGetIteratorJs['default'];
        }, function (_githubBizboardArvaUtils100Beta2ObjectHelperJs) {
            ObjectHelper = _githubBizboardArvaUtils100Beta2ObjectHelperJs.ObjectHelper;
        }, function (_srcCoreSnapshotJs) {
            Snapshot = _srcCoreSnapshotJs.Snapshot;
        }],
        execute: function () {
            /**
             This Source Code is licensed under the MIT license. If a copy of the
             MIT-license was not distributed with this file, You can obtain one at:
             http://opensource.org/licenses/mit-license.html.
            
             @author: Hans van den Akker (mysim1)
             @license MIT
             @copyright Bizboard, 2015
            
             */

            'use strict';

            SharePointSnapshot = (function (_Snapshot) {
                _inherits(SharePointSnapshot, _Snapshot);

                function SharePointSnapshot(dataSnapshot) {
                    var dataSource = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];
                    var kvpair = arguments.length <= 2 || arguments[2] === undefined ? null : arguments[2];

                    _classCallCheck(this, SharePointSnapshot);

                    _get(Object.getPrototypeOf(SharePointSnapshot.prototype), 'constructor', this).call(this);
                    this._data = dataSnapshot;
                    this._dataSource = dataSource;
                    this._kvpair = kvpair;

                    /* Bind all local methods to the current object instance, so we can refer to "this"
                     * in the methods as expected, even when they're called from event handlers.        */
                    ObjectHelper.bindAllMethods(this, this);
                }

                _createClass(SharePointSnapshot, [{
                    key: 'key',
                    value: function key() {

                        if (this._kvpair) return this._kvpair.key;else if (this._data instanceof Array && this._data.length == 1) return this._data[0].id;else if (this._data instanceof Object) return this._data.id;

                        //return this._data.id ? this._data.id : this._dataSource.key();
                    }
                }, {
                    key: 'val',
                    value: function val() {
                        if (this._kvpair) return this._kvpair.value;else return this._data;
                    }
                }, {
                    key: 'ref',
                    value: function ref() {
                        return this._dataSource;
                    }
                }, {
                    key: 'getPriority',
                    value: function getPriority() {/* Not implemented for SharePoint */
                        //TODO: have priority be part of list schema. and makes ordering super easy
                    }
                }, {
                    key: 'forEach',
                    value: function forEach(callback) {

                        if (this._data instanceof Array) {
                            var _iteratorNormalCompletion = true;
                            var _didIteratorError = false;
                            var _iteratorError = undefined;

                            try {
                                for (var _iterator = _getIterator(this._data), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                                    var _object = _step.value;

                                    callback(new SharePointSnapshot(_object, this._dataSource));
                                }
                            } catch (err) {
                                _didIteratorError = true;
                                _iteratorError = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion && _iterator['return']) {
                                        _iterator['return']();
                                    }
                                } finally {
                                    if (_didIteratorError) {
                                        throw _iteratorError;
                                    }
                                }
                            }
                        } else if (this._data instanceof Object) {
                            for (var key in this._data) {
                                callback(new SharePointSnapshot(object, this._dataSource, { key: key, value: this._data[key] }));
                            }
                        }
                    }
                }, {
                    key: 'numChildren',
                    value: function numChildren() {
                        if (this._data instanceof Array) {
                            return this._data.length;
                        } else if (this._data instanceof Object) {
                            return ObjectHelper.getEnumerableProperties(this._data).length;
                        } else {
                            return 0;
                        }
                    }
                }]);

                return SharePointSnapshot;
            })(Snapshot);

            _export('SharePointSnapshot', SharePointSnapshot);
        }
    };
});
System.register('github:bizboard/arva-utils@1.0.0-beta-2/ObjectHelper.js', ['npm:babel-runtime@5.8.25/helpers/create-class.js', 'npm:babel-runtime@5.8.25/helpers/class-call-check.js', 'npm:babel-runtime@5.8.25/core-js/object/get-own-property-descriptor.js', 'npm:babel-runtime@5.8.25/core-js/object/define-property.js', 'npm:babel-runtime@5.8.25/core-js/object/get-own-property-names.js', 'npm:babel-runtime@5.8.25/core-js/object/keys.js', 'npm:babel-runtime@5.8.25/core-js/get-iterator.js', 'npm:lodash@3.10.1.js'], function (_export) {
    var _createClass, _classCallCheck, _Object$getOwnPropertyDescriptor, _Object$defineProperty, _Object$getOwnPropertyNames, _Object$keys, _getIterator, _, ObjectHelper;

    return {
        setters: [function (_npmBabelRuntime5825HelpersCreateClassJs) {
            _createClass = _npmBabelRuntime5825HelpersCreateClassJs['default'];
        }, function (_npmBabelRuntime5825HelpersClassCallCheckJs) {
            _classCallCheck = _npmBabelRuntime5825HelpersClassCallCheckJs['default'];
        }, function (_npmBabelRuntime5825CoreJsObjectGetOwnPropertyDescriptorJs) {
            _Object$getOwnPropertyDescriptor = _npmBabelRuntime5825CoreJsObjectGetOwnPropertyDescriptorJs['default'];
        }, function (_npmBabelRuntime5825CoreJsObjectDefinePropertyJs) {
            _Object$defineProperty = _npmBabelRuntime5825CoreJsObjectDefinePropertyJs['default'];
        }, function (_npmBabelRuntime5825CoreJsObjectGetOwnPropertyNamesJs) {
            _Object$getOwnPropertyNames = _npmBabelRuntime5825CoreJsObjectGetOwnPropertyNamesJs['default'];
        }, function (_npmBabelRuntime5825CoreJsObjectKeysJs) {
            _Object$keys = _npmBabelRuntime5825CoreJsObjectKeysJs['default'];
        }, function (_npmBabelRuntime5825CoreJsGetIteratorJs) {
            _getIterator = _npmBabelRuntime5825CoreJsGetIteratorJs['default'];
        }, function (_npmLodash3101Js) {
            _ = _npmLodash3101Js['default'];
        }],
        execute: function () {
            /**
             This Source Code is licensed under the MIT license. If a copy of the
             MIT-license was not distributed with this file, You can obtain one at:
             http://opensource.org/licenses/mit-license.html.
            
             @author: Tom Clement (tjclement)
             @license MIT
             @copyright Bizboard, 2015
            
             */

            'use strict';

            ObjectHelper = (function () {
                function ObjectHelper() {
                    _classCallCheck(this, ObjectHelper);
                }

                _createClass(ObjectHelper, null, [{
                    key: 'hideMethodsAndPrivatePropertiesFromObject',

                    /* Sets enumerability of methods and all properties starting with '_' on an object to false,
                     * effectively hiding them from for(x in object) loops.   */
                    value: function hideMethodsAndPrivatePropertiesFromObject(object) {
                        for (var propName in object) {

                            var prototype = Object.getPrototypeOf(object);
                            var descriptor = prototype ? _Object$getOwnPropertyDescriptor(prototype, propName) : undefined;
                            if (descriptor && (descriptor.get || descriptor.set) && !propName.startsWith('_')) {
                                /* This is a public getter/setter, so we can skip it */
                                continue;
                            }

                            var property = object[propName];
                            if (typeof property === 'function' || propName.startsWith('_')) {
                                ObjectHelper.hidePropertyFromObject(object, propName);
                            }
                        }
                    }

                    /* Sets enumerability of methods on an object to false,
                     * effectively hiding them from for(x in object) loops.   */
                }, {
                    key: 'hideMethodsFromObject',
                    value: function hideMethodsFromObject(object) {
                        for (var propName in object) {
                            var property = object[propName];
                            if (typeof property === 'function') {
                                ObjectHelper.hidePropertyFromObject(object, propName);
                            }
                        }
                    }

                    /* Sets enumerability of an object's property to false,
                     * effectively hiding it from for(x in object) loops.   */
                }, {
                    key: 'hidePropertyFromObject',
                    value: function hidePropertyFromObject(object, propName) {
                        var prototype = object;
                        var descriptor = _Object$getOwnPropertyDescriptor(object, propName);
                        while (!descriptor) {
                            prototype = Object.getPrototypeOf(prototype);

                            if (prototype.constructor.name === 'Object' || prototype.constructor.name === 'Array') {
                                return;
                            }

                            descriptor = _Object$getOwnPropertyDescriptor(prototype, propName);
                        }
                        descriptor.enumerable = false;
                        _Object$defineProperty(prototype, propName, descriptor);
                        _Object$defineProperty(object, propName, descriptor);
                    }

                    /* Sets enumerability of all of an object's properties (including methods) to false,
                     * effectively hiding them from for(x in object) loops.   */
                }, {
                    key: 'hideAllPropertiesFromObject',
                    value: function hideAllPropertiesFromObject(object) {
                        for (var propName in object) {
                            ObjectHelper.hidePropertyFromObject(object, propName);
                        }
                    }

                    /* Adds a property with enumerable: false to object */
                }, {
                    key: 'addHiddenPropertyToObject',
                    value: function addHiddenPropertyToObject(object, propName, prop) {
                        var writable = arguments.length <= 3 || arguments[3] === undefined ? true : arguments[3];
                        var useAccessors = arguments.length <= 4 || arguments[4] === undefined ? true : arguments[4];

                        return ObjectHelper.addPropertyToObject(object, propName, prop, false, writable, undefined, useAccessors);
                    }

                    /* Adds a property with given enumerability and writability to object. If writable, uses a hidden object.shadow
                     * property to save the actual data state, and object[propName] with gettter/setter to the shadow. Allows for a
                     * callback to be triggered upon every set.   */
                }, {
                    key: 'addPropertyToObject',
                    value: function addPropertyToObject(object, propName, prop) {
                        var enumerable = arguments.length <= 3 || arguments[3] === undefined ? true : arguments[3];
                        var writable = arguments.length <= 4 || arguments[4] === undefined ? true : arguments[4];
                        var setCallback = arguments.length <= 5 || arguments[5] === undefined ? null : arguments[5];
                        var useAccessors = arguments.length <= 6 || arguments[6] === undefined ? true : arguments[6];

                        /* If property is non-writable, we won't need a shadowed prop for the getters/setters */
                        if (!writable || !useAccessors) {
                            var descriptor = {
                                enumerable: enumerable,
                                writable: writable,
                                value: prop
                            };
                            _Object$defineProperty(object, propName, descriptor);
                        } else {
                            ObjectHelper.addGetSetPropertyWithShadow(object, propName, prop, enumerable, writable, setCallback);
                        }
                    }

                    /* Adds given property to the object with get() and set() accessors, and saves actual data in object.shadow */
                }, {
                    key: 'addGetSetPropertyWithShadow',
                    value: function addGetSetPropertyWithShadow(object, propName, prop) {
                        var enumerable = arguments.length <= 3 || arguments[3] === undefined ? true : arguments[3];
                        var writable = arguments.length <= 4 || arguments[4] === undefined ? true : arguments[4];
                        var setCallback = arguments.length <= 5 || arguments[5] === undefined ? null : arguments[5];

                        ObjectHelper.buildPropertyShadow(object, propName, prop);
                        ObjectHelper.buildGetSetProperty(object, propName, enumerable, writable, setCallback);
                    }

                    /* Creates or extends object.shadow to contain a property with name propName */
                }, {
                    key: 'buildPropertyShadow',
                    value: function buildPropertyShadow(object, propName, prop) {
                        var shadow = {};

                        try {
                            /* If a shadow property already exists, we should extend instead of overwriting it. */
                            if ('shadow' in object) {
                                shadow = object.shadow;
                            }
                        } catch (error) {
                            return;
                        }

                        shadow[propName] = prop;
                        Object.defineProperty(object, 'shadow', {
                            writable: true,
                            configurable: true,
                            enumerable: false,
                            value: shadow
                        });
                    }

                    /* Creates a property on object that has a getter that fetches from object.shadow,
                     * and a setter that sets object.shadow as well as triggers setCallback() if set.   */
                }, {
                    key: 'buildGetSetProperty',
                    value: function buildGetSetProperty(object, propName) {
                        var enumerable = arguments.length <= 2 || arguments[2] === undefined ? true : arguments[2];
                        var writable = arguments.length <= 3 || arguments[3] === undefined ? true : arguments[3];
                        var setCallback = arguments.length <= 4 || arguments[4] === undefined ? null : arguments[4];

                        var descriptor = {
                            enumerable: enumerable,
                            configurable: true,
                            get: function get() {
                                return object.shadow[propName];
                            },
                            set: function set(value) {
                                if (writable) {
                                    object.shadow[propName] = value;
                                    if (setCallback && typeof setCallback === 'function') {
                                        setCallback({
                                            propertyName: propName,
                                            newValue: value
                                        });
                                    }
                                } else {
                                    throw new ReferenceError('Attempted to write to non-writable property ' + propName + '.');
                                }
                            }
                        };

                        _Object$defineProperty(object, propName, descriptor);
                    }

                    /* Calls object['functionName'].bind(bindTarget) on all of object's functions. */
                }, {
                    key: 'bindAllMethods',
                    value: function bindAllMethods(object, bindTarget) {
                        /* Bind all current object's methods to bindTarget. */
                        var methodNames = ObjectHelper.getMethodNames(object);
                        methodNames.forEach(function (name) {
                            object[name] = object[name].bind(bindTarget);
                        });
                    }
                }, {
                    key: 'getMethodNames',
                    value: function getMethodNames(object) {
                        var methodNames = arguments.length <= 1 || arguments[1] === undefined ? [] : arguments[1];

                        var propNames = _Object$getOwnPropertyNames(object).filter(function (c) {
                            return typeof object[c] === 'function';
                        });
                        methodNames = methodNames.concat(propNames);

                        /* Recursively find prototype's methods until we hit the Object prototype. */
                        var prototype = Object.getPrototypeOf(object);
                        if (prototype.constructor.name !== 'Object' && prototype.constructor.name !== 'Array') {
                            return ObjectHelper.getMethodNames(prototype, methodNames);
                        }

                        return methodNames;
                    }

                    /* Returns a new object with all enumerable properties of the given object */
                }, {
                    key: 'getEnumerableProperties',
                    value: function getEnumerableProperties(object) {

                        return ObjectHelper.getPrototypeEnumerableProperties(object, object);
                    }
                }, {
                    key: 'getPrototypeEnumerableProperties',
                    value: function getPrototypeEnumerableProperties(rootObject, prototype) {
                        var result = {};

                        /* Collect all propertise in the prototype's keys() enumerable */
                        var propNames = _Object$keys(prototype);
                        var _iteratorNormalCompletion = true;
                        var _didIteratorError = false;
                        var _iteratorError = undefined;

                        try {
                            for (var _iterator = _getIterator(propNames), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                                var _name = _step.value;

                                var value = rootObject[_name];

                                /* Value must be a non-null primitive or object to be pushable to a dataSource */
                                if (value !== null && value !== undefined && typeof value !== 'function') {
                                    if (typeof value === 'object' && !(value instanceof Array)) {
                                        result[_name] = ObjectHelper.getEnumerableProperties(value);
                                    } else {
                                        result[_name] = value;
                                    }
                                }
                            }

                            /* Collect all properties with accessors (getters/setters) that are enumerable, too */
                        } catch (err) {
                            _didIteratorError = true;
                            _iteratorError = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion && _iterator['return']) {
                                    _iterator['return']();
                                }
                            } finally {
                                if (_didIteratorError) {
                                    throw _iteratorError;
                                }
                            }
                        }

                        var descriptorNames = _Object$getOwnPropertyNames(prototype);
                        descriptorNames = descriptorNames.filter(function (name) {
                            return propNames.indexOf(name) < 0;
                        });
                        var _iteratorNormalCompletion2 = true;
                        var _didIteratorError2 = false;
                        var _iteratorError2 = undefined;

                        try {
                            for (var _iterator2 = _getIterator(descriptorNames), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                                var _name2 = _step2.value;

                                var descriptor = _Object$getOwnPropertyDescriptor(prototype, _name2);
                                if (descriptor && descriptor.enumerable) {
                                    var value = rootObject[_name2];

                                    /* Value must be a non-null primitive or object to be pushable to a dataSource */
                                    if (value !== null && value !== undefined && typeof value !== 'function') {
                                        if (typeof value === 'object' && !(value instanceof Array)) {
                                            result[_name2] = ObjectHelper.getEnumerableProperties(value);
                                        } else {
                                            result[_name2] = value;
                                        }
                                    }
                                }
                            }

                            /* Collect all enumerable properties in the prototype's prototype as well */
                        } catch (err) {
                            _didIteratorError2 = true;
                            _iteratorError2 = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion2 && _iterator2['return']) {
                                    _iterator2['return']();
                                }
                            } finally {
                                if (_didIteratorError2) {
                                    throw _iteratorError2;
                                }
                            }
                        }

                        var superPrototype = Object.getPrototypeOf(prototype);
                        var ignorableTypes = ['Object', 'Array', 'EventEmitter'];
                        if (ignorableTypes.indexOf(superPrototype.constructor.name) === -1) {
                            var prototypeEnumerables = ObjectHelper.getPrototypeEnumerableProperties(rootObject, superPrototype);
                            _.merge(result, prototypeEnumerables);
                        }

                        return result;
                    }
                }]);

                return ObjectHelper;
            })();

            _export('ObjectHelper', ObjectHelper);
        }
    };
});
System.register('src/core/PrioritisedObject.js', ['npm:babel-runtime@5.8.25/helpers/get.js', 'npm:babel-runtime@5.8.25/helpers/inherits.js', 'npm:babel-runtime@5.8.25/helpers/create-class.js', 'npm:babel-runtime@5.8.25/helpers/class-call-check.js', 'npm:babel-runtime@5.8.25/core-js/object/get-own-property-descriptor.js', 'npm:lodash@3.10.1.js', 'npm:eventemitter3@1.1.1.js', 'github:bizboard/arva-utils@1.0.0-beta-2/ObjectHelper.js'], function (_export) {
    var _get, _inherits, _createClass, _classCallCheck, _Object$getOwnPropertyDescriptor, _, EventEmitter, ObjectHelper, PrioritisedObject;

    return {
        setters: [function (_npmBabelRuntime5825HelpersGetJs) {
            _get = _npmBabelRuntime5825HelpersGetJs['default'];
        }, function (_npmBabelRuntime5825HelpersInheritsJs) {
            _inherits = _npmBabelRuntime5825HelpersInheritsJs['default'];
        }, function (_npmBabelRuntime5825HelpersCreateClassJs) {
            _createClass = _npmBabelRuntime5825HelpersCreateClassJs['default'];
        }, function (_npmBabelRuntime5825HelpersClassCallCheckJs) {
            _classCallCheck = _npmBabelRuntime5825HelpersClassCallCheckJs['default'];
        }, function (_npmBabelRuntime5825CoreJsObjectGetOwnPropertyDescriptorJs) {
            _Object$getOwnPropertyDescriptor = _npmBabelRuntime5825CoreJsObjectGetOwnPropertyDescriptorJs['default'];
        }, function (_npmLodash3101Js) {
            _ = _npmLodash3101Js['default'];
        }, function (_npmEventemitter3111Js) {
            EventEmitter = _npmEventemitter3111Js['default'];
        }, function (_githubBizboardArvaUtils100Beta2ObjectHelperJs) {
            ObjectHelper = _githubBizboardArvaUtils100Beta2ObjectHelperJs.ObjectHelper;
        }],
        execute: function () {
            /**
             This Source Code is licensed under the MIT license. If a copy of the
             MIT-license was not distributed with this file, You can obtain one at:
             http://opensource.org/licenses/mit-license.html.
            
            
             @author: Tom Clement (tjclement)
             @license MIT
             @copyright Bizboard, 2015
            
             */

            'use strict';

            PrioritisedObject = (function (_EventEmitter) {
                _inherits(PrioritisedObject, _EventEmitter);

                _createClass(PrioritisedObject, [{
                    key: 'id',
                    get: function get() {
                        return this._id;
                    },
                    set: function set(value) {
                        this._id = value;
                    }

                    /** Priority (positioning) of the object in the dataSource */
                }, {
                    key: 'priority',
                    get: function get() {
                        return this._priority;
                    },
                    set: function set(value) {
                        if (this._priority !== value) {
                            this._priority = value;
                            this._dataSource.setPriority(value);
                        }
                    }

                    /* TODO: refactor out after we've resolved SharepointDataSource specific issue. */
                }, {
                    key: '_inheritable',
                    get: function get() {
                        return this._dataSource ? this._dataSource.inheritable : false;
                    }

                    /**
                     * @param {DataSource} dataSource DataSource to construct this PrioritisedObject with.
                     * @param {Snapshot} dataSnapshot Optional: dataSnapshot already containing model data, so we can skip subscribing to the full data on the dataSource.
                     * @returns {PrioritisedObject} PrioritisedObject instance.
                     */
                }]);

                function PrioritisedObject(dataSource) {
                    var dataSnapshot = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];

                    _classCallCheck(this, PrioritisedObject);

                    _get(Object.getPrototypeOf(PrioritisedObject.prototype), 'constructor', this).call(this);

                    /**** Callbacks ****/
                    this._valueChangedCallback = null;

                    /**** Private properties ****/
                    this._id = dataSource ? dataSource.key() : 0;
                    this._events = this._events || [];
                    this._dataSource = dataSource;
                    this._priority = 0; // Priority of this object on remote dataSource
                    this._isBeingWrittenByDatasource = false; // Flag to determine when dataSource is updating object

                    /* Bind all local methods to the current object instance, so we can refer to "this"
                     * in the methods as expected, even when they're called from event handlers.        */
                    ObjectHelper.bindAllMethods(this, this);

                    /* Hide all private properties (starting with '_') and methods from enumeration,
                     * so when you do for( in ), only actual data properties show up. */
                    ObjectHelper.hideMethodsAndPrivatePropertiesFromObject(this);

                    /* Hide the id field from enumeration, so we don't save it to the dataSource. */
                    ObjectHelper.hidePropertyFromObject(this, 'id');

                    /* Hide the priority field from enumeration, so we don't save it to the dataSource. */
                    ObjectHelper.hidePropertyFromObject(this, 'priority');

                    if (dataSnapshot) {
                        this._buildFromSnapshot(dataSnapshot);
                    } else {
                        this._buildFromDataSource(dataSource);
                    }
                }

                /**
                 *  Deletes the current object from the dataSource, and clears itself to free memory.
                 *  @returns {void}
                 */

                _createClass(PrioritisedObject, [{
                    key: 'remove',
                    value: function remove() {
                        this.off();
                        this._dataSource.remove(this);
                        delete this;
                    }

                    /**
                     * Subscribes to the given event type exactly once; it automatically unsubscribes after the first time it is triggered.
                     * @param {String} event One of the following Event Types: 'value', 'child_changed', 'child_moved', 'child_removed'.
                     * @param {Function} handler Function that is called when the given event type is emitted.
                     * @param {Object} context Optional: context of 'this' inside the handler function when it is called.
                     * @returns {void}
                     */
                }, {
                    key: 'once',
                    value: function once(event, handler) {
                        var context = arguments.length <= 2 || arguments[2] === undefined ? this : arguments[2];

                        return this.on(event, function onceWrapper() {
                            /* TODO: bug in traceur preventing us from using ...arguments as expected: https://github.com/google/traceur-compiler/issues/1118
                             * We want to do this: handler.call(context, ...arguments); */
                            handler.call(context, arguments);
                            this.off(event, onceWrapper, context);
                        }, this);
                    }

                    /**
                     * Subscribes to events emitted by this PrioritisedArray.
                     * @param {String} event One of the following Event Types: 'value', 'child_changed', 'child_moved', 'child_removed'.
                     * @param {Function} handler Function that is called when the given event type is emitted.
                     * @param {Object} context Optional: context of 'this' inside the handler function when it is called.
                     * @returns {void}
                     */
                }, {
                    key: 'on',
                    value: function on(event, handler) {
                        var context = arguments.length <= 2 || arguments[2] === undefined ? this : arguments[2];

                        var haveListeners = this.listeners(event, true);
                        _get(Object.getPrototypeOf(PrioritisedObject.prototype), 'on', this).call(this, event, handler, context);

                        switch (event) {
                            case 'ready':
                                /* If we're already ready, fire immediately */
                                if (this._dataSource && this._dataSource.ready) {
                                    handler.call(context, this);
                                }
                                break;
                            case 'value':
                                if (!haveListeners) {
                                    /* Only subscribe to the dataSource if there are no previous listeners for this event type. */
                                    this._dataSource.setValueChangedCallback(this._onChildValue);
                                } else {
                                    /* If there are previous listeners, fire the value callback once to present the subscriber with inital data. */
                                    handler.call(context, this);
                                }
                                break;
                            case 'added':
                                if (!haveListeners) {
                                    this._dataSource.setChildAddedCallback(this._onChildAdded);
                                }
                                break;
                            case 'moved':
                                if (!haveListeners) {
                                    this._dataSource.setChildMovedCallback(this._onChildMoved);
                                }
                                break;
                            case 'removed':
                                if (!haveListeners) {
                                    this._dataSource.setChildRemovedCallback(this._onChildRemoved);
                                }
                                break;
                            default:
                                break;
                        }
                    }

                    /**
                     * Removes subscription to events emitted by this PrioritisedArray. If no handler or context is given, all handlers for
                     * the given event are removed. If no parameters are given at all, all event types will have their handlers removed.
                     * @param {String} event One of the following Event Types: 'value', 'child_changed', 'child_moved', 'child_removed'.
                     * @param {Function} handler Function to remove from event callbacks.
                     * @param {Object} context Object to bind the given callback function to.
                     * @returns {void}
                     */
                }, {
                    key: 'off',
                    value: function off(event, handler, context) {
                        if (event && (handler || context)) {
                            _get(Object.getPrototypeOf(PrioritisedObject.prototype), 'removeListener', this).call(this, event, handler, context);
                        } else {
                            _get(Object.getPrototypeOf(PrioritisedObject.prototype), 'removeAllListeners', this).call(this, event);
                        }

                        /* If we have no more listeners of this event type, remove dataSource callback. */
                        if (!this.listeners(event, true)) {
                            switch (event) {
                                case 'ready':
                                    break;
                                case 'value':
                                    this._dataSource.removeValueChangedCallback();
                                    break;
                                case 'added':
                                    this._dataSource.removeChildAddedCallback();
                                    break;
                                case 'moved':
                                    this._dataSource.removeChildMovedCallback();
                                    break;
                                case 'removed':
                                    this._dataSource.removeChildRemovedCallback();
                                    break;
                                default:
                                    break;
                            }
                        }
                    }

                    /**
                     * Allows multiple modifications to be made to the model without triggering dataSource pushes and event emits for each change.
                     * Triggers a push to the dataSource after executing the given method. This push should then emit an event notifying subscribers of any changes.
                     * @param {Function} method Function in which the model can be modified.
                     * @returns {void}
                     */
                }, {
                    key: 'transaction',
                    value: function transaction(method) {
                        this.disableChangeListener();
                        method();
                        this.enableChangeListener();
                        this._onSetterTriggered();
                    }

                    /**
                     * Disables pushes of local changes to the dataSource, and stops event emits that refer to the model's data.
                     * @returns {void}
                     */
                }, {
                    key: 'disableChangeListener',
                    value: function disableChangeListener() {
                        this._isBeingWrittenByDatasource = true;
                    }

                    /**
                     * Enables pushes of local changes to the dataSource, and enables event emits that refer to the model's data.
                     * The change listener is active by default, so you'll only need to call this method if you've previously called disableChangeListener().
                     * @returns {void}
                     */
                }, {
                    key: 'enableChangeListener',
                    value: function enableChangeListener() {
                        this._isBeingWrittenByDatasource = false;
                    }

                    /**
                     * Recursively builds getter/setter based properties on current PrioritisedObject from
                     * a given dataSnapshot. If an object value is detected, the object itself gets built as
                     * another PrioritisedObject and set to the current PrioritisedObject as a property.
                     * @param {Snapshot} dataSnapshot DataSnapshot to build the PrioritisedObject from.
                     * @returns {void}
                     * @private
                     */
                }, {
                    key: '_buildFromSnapshot',
                    value: function _buildFromSnapshot(dataSnapshot) {

                        /* Set root object _priority */
                        this._priority = dataSnapshot.getPriority();
                        var data = dataSnapshot.val();
                        var numChildren = dataSnapshot.numChildren();

                        if (!this._id) {
                            this._id = dataSnapshot.key();
                        }

                        /* If there is no data at this point yet, fire a ready event */
                        if (numChildren === 0) {
                            this._dataSource.ready = true;
                            this.emit('ready');
                        }

                        for (var key in data) {

                            /* Only map properties that exists on our model */
                            if (_Object$getOwnPropertyDescriptor(this, key)) {
                                /* If child is a primitive, listen to changes so we can synch with Firebase */
                                ObjectHelper.addPropertyToObject(this, key, data[key], true, true, this._onSetterTriggered);
                            }
                        }

                        this._dataSource.ready = true;
                        this.emit('ready');
                    }

                    /**
                     * Clones a dataSource (to not disturb any existing callbacks defined on the original) and uses it
                     * to get a dataSnapshot which is used in _buildSnapshot to build our object.
                     * @param {DataSource} dataSource DataSource to build the PrioritisedObject from.
                     * @returns {void}
                     * @private
                     */
                }, {
                    key: '_buildFromDataSource',
                    value: function _buildFromDataSource(dataSource) {
                        if (!dataSource) {
                            return;
                        }
                        dataSource.once('value', this._buildFromSnapshot);
                    }

                    /**
                     * Gets called whenever a property value is set on this object.
                     * This can happen when local code modifies it, or when the dataSource updates it.
                     * We only propagate changes to the dataSource if the change was local.
                     * @returns {void}
                     * @private
                     */
                }, {
                    key: '_onSetterTriggered',
                    value: function _onSetterTriggered() {
                        if (!this._isBeingWrittenByDatasource) {
                            this._dataSource.setWithPriority(ObjectHelper.getEnumerableProperties(this), this._priority);
                        }
                    }

                    /**
                     * Gets called whenever the current PrioritisedObject is changed by the dataSource.
                     * @param {DataSnapshot} dataSnapshot Snapshot of the new object value.
                     * @param {String} previousSiblingID ID of the model preceding the current one.
                     * @returns {void}
                     * @private
                     */
                }, {
                    key: '_onChildValue',
                    value: function _onChildValue(dataSnapshot, previousSiblingID) {

                        /* If the new dataSource data is equal to what we have locally,
                         * this is an update triggered by a local change having been pushed
                         * to the remote dataSource. We can ignore it.
                         */
                        if (_.isEqual(ObjectHelper.getEnumerableProperties(this), dataSnapshot.val())) {
                            this.emit('value', this, previousSiblingID);
                            return;
                        }

                        /* Make sure we don't trigger pushes to dataSource whilst repopulating with new dataSource data */
                        this._isBeingWrittenByDatasource = true;
                        this._buildFromSnapshot(dataSnapshot);
                        this._isBeingWrittenByDatasource = false;

                        this.emit('value', this, previousSiblingID);
                    }

                    /* TODO: implement partial updates of model */
                }, {
                    key: '_onChildAdded',
                    value: function _onChildAdded(dataSnapshot, previousSiblingID) {
                        this.emit('added', this, previousSiblingID);
                    }
                }, {
                    key: '_onChildMoved',
                    value: function _onChildMoved(dataSnapshot, previousSiblingID) {
                        this.emit('moved', this, previousSiblingID);
                    }
                }, {
                    key: '_onChildRemoved',
                    value: function _onChildRemoved(dataSnapshot, previousSiblingID) {
                        this.emit('removed', this, previousSiblingID);
                    }
                }]);

                return PrioritisedObject;
            })(EventEmitter);

            _export('PrioritisedObject', PrioritisedObject);
        }
    };
});
System.register('src/datasources/FirebaseDataSource.js', ['npm:babel-runtime@5.8.25/helpers/get.js', 'npm:babel-runtime@5.8.25/helpers/inherits.js', 'npm:babel-runtime@5.8.25/helpers/create-class.js', 'npm:babel-runtime@5.8.25/helpers/class-call-check.js', 'npm:babel-runtime@5.8.25/helpers/slice.js', 'npm:lodash@3.10.1.js', 'github:firebase/firebase-bower@2.3.1.js', 'github:bizboard/di.js@master.js', 'src/core/DataSource.js', 'github:bizboard/arva-utils@1.0.0-beta-2/ObjectHelper.js'], function (_export) {
    var _get, _inherits, _createClass, _classCallCheck, _slice, _, Firebase, provide, DataSource, ObjectHelper, FirebaseDataSource;

    return {
        setters: [function (_npmBabelRuntime5825HelpersGetJs) {
            _get = _npmBabelRuntime5825HelpersGetJs['default'];
        }, function (_npmBabelRuntime5825HelpersInheritsJs) {
            _inherits = _npmBabelRuntime5825HelpersInheritsJs['default'];
        }, function (_npmBabelRuntime5825HelpersCreateClassJs) {
            _createClass = _npmBabelRuntime5825HelpersCreateClassJs['default'];
        }, function (_npmBabelRuntime5825HelpersClassCallCheckJs) {
            _classCallCheck = _npmBabelRuntime5825HelpersClassCallCheckJs['default'];
        }, function (_npmBabelRuntime5825HelpersSliceJs) {
            _slice = _npmBabelRuntime5825HelpersSliceJs['default'];
        }, function (_npmLodash3101Js) {
            _ = _npmLodash3101Js['default'];
        }, function (_githubFirebaseFirebaseBower231Js) {
            Firebase = _githubFirebaseFirebaseBower231Js['default'];
        }, function (_githubBizboardDiJsMasterJs) {
            provide = _githubBizboardDiJsMasterJs.provide;
        }, function (_srcCoreDataSourceJs) {
            DataSource = _srcCoreDataSourceJs.DataSource;
        }, function (_githubBizboardArvaUtils100Beta2ObjectHelperJs) {
            ObjectHelper = _githubBizboardArvaUtils100Beta2ObjectHelperJs.ObjectHelper;
        }],
        execute: function () {
            /**
             This Source Code is licensed under the MIT license. If a copy of the
             MIT-license was not distributed with this file, You can obtain one at:
             http://opensource.org/licenses/mit-license.html.
            
             @author: Tom Clement (tjclement)
             @license MIT
             @copyright Bizboard, 2015
            
             */
            'use strict';

            FirebaseDataSource = (function (_DataSource) {
                _inherits(FirebaseDataSource, _DataSource);

                _createClass(FirebaseDataSource, [{
                    key: 'dataReference',
                    get: function get() {
                        return this._orderedDataReference;
                    },
                    set: function set(value) {
                        this._orderedDataReference = value;
                    }

                    /**
                     * @param {String} path Full path to resource in remote data storage.
                     * @return {FirebaseDataSource} FirebaseDataSource instance.
                     * @param {Object} options Optional: options to construct the DataSource with.
                     * @param {String} [options.orderBy] Optional, order all items received through the dataSource.
                     *                                   Options are: '.priority', '.value', or a string containing the child key to order by (e.g. 'MyModelProperty')
                     * @param {Number} [options.limitToFirst] Optional, only subscribe to the first amount of entries.
                     * @param {Number} [options.limitToLast] Optional, only subscribe to the last amount of entries.
                     **/
                }]);

                function FirebaseDataSource(path) {
                    var options = arguments.length <= 1 || arguments[1] === undefined ? { orderBy: '.priority' } : arguments[1];

                    _classCallCheck(this, _FirebaseDataSource);

                    _get(Object.getPrototypeOf(_FirebaseDataSource.prototype), 'constructor', this).call(this, path);
                    this._onValueCallback = null;
                    this._onAddCallback = null;
                    this._onChangeCallback = null;
                    this._onMoveCallback = null;
                    this._onRemoveCallback = null;
                    this._dataReference = new Firebase(path);
                    this.handlers = {};
                    this.options = options;

                    /* Populate the orderedReference, which is the standard Firebase reference with an optional ordering
                     * defined. This needs to be saved seperately, because methods like child() and key() can't be called
                     * from the ordered reference, and must instead be performed on the standard reference. */
                    if (this.options.orderBy && this.options.orderBy === '.priority') {
                        this._orderedDataReference = this._dataReference.orderByPriority();
                    } else if (this.options.orderBy && this.options.orderBy === '.value') {
                        this._orderedDataReference = this._dataReference.orderByValue();
                    } else if (this.options.orderBy && this.options.orderBy !== '') {
                        this._orderedDataReference = this._dataReference.orderByChild(this.options.orderBy);
                    } else {
                        this._orderedDataReference = this._dataReference;
                    }

                    if (this.options.limitToFirst !== undefined) {
                        this._orderedDataReference = this._orderedDataReference.limitToFirst(this.options.limitToFirst);
                    } else if (this.options.limitToLast !== undefined) {
                        this._orderedDataReference = this._orderedDataReference.limitToLast(this.options.limitToLast);
                    }

                    /* Bind all local methods to the current object instance, so we can refer to "this"
                     * in the methods as expected, even when they're called from event handlers. */
                    ObjectHelper.bindAllMethods(this, this);
                }

                /**
                 * Returns the full path to this dataSource's source on the remote storage provider.
                 * @returns {String} Full resource path.
                 */

                _createClass(FirebaseDataSource, [{
                    key: 'toString',
                    value: function toString() {
                        return this._dataReference.toString();
                    }

                    /**
                     * Returns a dataSource reference to the given child branch of the current datasource.
                     * @param {String} childName Child branch name.
                     * @param {Object} options Optional: additional options to pass to new DataSource instance.
                     * @returns {DataSource} New dataSource instance pointing to the given child branch.
                     */
                }, {
                    key: 'child',
                    value: function child(childName) {
                        var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

                        return new FirebaseDataSource(this._dataReference.toString() + '/' + childName, options);
                    }

                    /**
                     * Returns the full URL to the path on the dataSource. Functionally identical to toString().
                     * @returns {String} Full resource path.
                     */
                }, {
                    key: 'path',
                    value: function path() {
                        return this._dataReference.toString();
                    }

                    /**
                     * Returns the name of the current branch in the path on the dataSource.
                     * @returns {String} Current branch name.
                     */
                }, {
                    key: 'key',
                    value: function key() {
                        return this._dataReference.key();
                    }

                    /**
                     * Writes newData to the path this dataSource was constructed with.
                     * @param {Object} newData Data to write to dataSource.
                     * @returns {void}
                     */
                }, {
                    key: 'set',
                    value: function set(newData) {
                        return this._orderedDataReference.set(newData);
                    }

                    /**
                     * Removes the object and all underlying children that this dataSource points to.
                     * @returns {void}
                     */
                }, {
                    key: 'remove',
                    value: function remove() {
                        return this._orderedDataReference.remove();
                    }

                    /**
                     * Writes newData to the path this dataSource was constructed with, appended by a random UID generated by
                     * the dataSource.
                     * @param {Object} newData New data to append to dataSource.
                     * @returns {void}
                     */
                }, {
                    key: 'push',
                    value: function push(newData) {
                        return new FirebaseDataSource(this._orderedDataReference.push(newData).toString());
                    }

                    /**
                     * Writes newData with given priority (ordering) to the path this dataSource was constructed with.
                     * @param {Object} newData New data to set.
                     * @param {String|Number} priority Priority value by which the data should be ordered.
                     * @returns {void}
                     */
                }, {
                    key: 'setWithPriority',
                    value: function setWithPriority(newData, priority) {
                        return this._orderedDataReference.setWithPriority(newData, priority);
                    }

                    /**
                     * Sets the priority (ordering) of an object on a given dataSource.
                     * @param {String|Number} newPriority New priority value to order data by.
                     * @returns {void}
                     */
                }, {
                    key: 'setPriority',
                    value: function setPriority(newPriority) {
                        return this._orderedDataReference.setPriority(newPriority);
                    }

                    /**
                     * Orders the DataSource's childs by the value in child[key].
                     * @param {String} childKey Key of the field to order by.
                     * @returns {DataSource} New dataSource instance.
                     */
                }, {
                    key: 'orderByChild',
                    value: function orderByChild(childKey) {
                        return new FirebaseDataSource(this.toString(), _.merge({}, this.options, { orderBy: childKey }));
                    }

                    /**
                     * Orders the DataSource's childs by their key names, ignoring their priority.
                     * @returns {DataSource} New dataSource instance.
                     */
                }, {
                    key: 'orderByKey',
                    value: function orderByKey() {
                        return new FirebaseDataSource(this.toString(), _.merge({}, this.options, { orderBy: '.key' }));
                    }

                    /**
                     * Orders the DataSource's childs by their values, ignoring their priority.
                     * @returns {DataSource} New dataSource instance.
                     */
                }, {
                    key: 'orderByValue',
                    value: function orderByValue() {
                        return new FirebaseDataSource(this.toString(), _.merge({}, this.options, { orderBy: '.value' }));
                    }

                    /**
                     * Returns a new dataSource reference that will limit the subscription to only the first given amount items.
                     * @param {Number} amount Amount of items to limit the dataSource to.
                     * @returns {DataSource} New dataSource instance.
                     */
                }, {
                    key: 'limitToFirst',
                    value: function limitToFirst(amount) {
                        return new FirebaseDataSource(this.toString(), _.merge({}, this.options, { limitToFirst: amount }));
                    }

                    /**
                     * Returns a new dataSource reference that will limit the subscription to only the last given amount items.
                     * @param {Number} amount Amount of items to limit the dataSource to.
                     * @returns {DataSource} New dataSource instance.
                     */
                }, {
                    key: 'limitToLast',
                    value: function limitToLast(amount) {
                        return new FirebaseDataSource(this.toString(), _.merge({}, this.options, { limitToLast: amount }));
                    }

                    /**
                     * Authenticates all instances of this DataSource with the given OAuth provider and credentials.
                     * @param {String} provider google, facebook, github, or twitter
                     * @param {String|Object} credentials Access token string, or object with key/value pairs with e.g. OAuth 1.1 credentials.
                     * @param {Function} onComplete Callback, executed when login is completed either successfully or erroneously.
                     * On error, first argument is error message.
                     * On success, the first argument is null, and the second argument is an object containing the fields uid, provider, auth, and expires.
                     * @param {Object} options Optional, additional client arguments, such as configuring session persistence.
                     * @returns {void}
                     */
                }, {
                    key: 'authWithOAuthToken',
                    value: function authWithOAuthToken(provider, credentials, onComplete, options) {
                        return this._dataReference.authWithOAuthToken(provider, credentials, onComplete, options);
                    }

                    /**
                     * Authenticates all instances of this DataSource with a custom auth token or secret.
                     * @param {String} authToken Authentication token or secret.
                     * @param {Function} onComplete Callback, executed when login is completed either successfully or erroneously.
                     * On error, first argument is error message.
                     * On success, the first argument is null, and the second argument is an object containing the fields uid, provider, auth, and expires.
                     * @param {Object} options Optional, additional client arguments, such as configuring session persistence.
                     * @returns {void}
                     */
                }, {
                    key: 'authWithCustomToken',
                    value: function authWithCustomToken(authToken, onComplete, options) {
                        return this._dataReference.authWithCustomToken(authToken, onComplete, options);
                    }

                    /**
                     * Authenticates all instances of this DataSource with the given email/password credentials.
                     * @param {String|Object} credentials Object with key/value pairs {email: "value", password:"value"}.
                     * @param {Function} onComplete Callback, executed when login is completed either successfully or erroneously.
                     * On error, first argument is error message.
                     * On success, the first argument is null, and the second argument is an object containing the fields uid, provider, auth, and expires.
                     * @param {Object} options Optional, additional client arguments, such as configuring session persistence.
                     * @returns {void}
                     */
                }, {
                    key: 'authWithPassword',
                    value: function authWithPassword(credentials, onComplete, options) {
                        return this._dataReference.authWithPassword(credentials, onComplete, options);
                    }

                    /**
                     * Authenticates all instances of this DataSource as an anonymous user.
                     * @param {Function} onComplete Callback, executed when login is completed either successfully or erroneously.
                     * On error, first argument is error message.
                     * On success, the first argument is null, and the second argument is an object containing the fields uid, provider, auth, and expires.
                     * @param {Object} options Optional, additional client arguments, such as configuring session persistence.
                     * @returns {void}
                     */
                }, {
                    key: 'authAnonymously',
                    value: function authAnonymously(onComplete, options) {
                        return this._dataReference.authAnonymously(onComplete, options);
                    }

                    /**
                     * Fetches the current user's authentication state.
                     * If the user is authenticated, returns an object containing at least the fields uid, provider, auth, and expires.
                     * If the user is not authenticated, returns null.
                     * @returns {Object|null} User auth object.
                     */
                }, {
                    key: 'getAuth',
                    value: function getAuth() {
                        return this._dataReference.getAuth();
                    }

                    /**
                     * Logs out from the datasource, allowing to re-authenticate at a later time.
                     * @returns {void}
                     */
                }, {
                    key: 'unauth',
                    value: function unauth() {
                        return this._dataReference.unauth();
                    }

                    /**
                     * Subscribe to an event emitted by the DataSource.
                     * @param {String} event Event type to subscribe to. Allowed values are: 'value', 'child_changed', 'child_added', 'child_removed', 'child_moved'.
                     * @param {Function} handler Function to call when the subscribed event is emitted.
                     * @param {Object} context Context to set 'this' to when calling the handler function.
                     */
                }, {
                    key: 'on',
                    value: function on(event, handler) {
                        var context = arguments.length <= 2 || arguments[2] === undefined ? this : arguments[2];

                        var boundHandler = this.handlers[handler] = handler.bind(this);
                        this._orderedDataReference.on(event, boundHandler);
                    }

                    /**
                     * Subscribe to an event emitted by the DataSource once, and then immediately unsubscribe again once it has been emitted a single time.
                     * @param {String} event Event type to subscribe to. Allowed values are: 'value', 'child_changed', 'child_added', 'child_removed', 'child_moved'.
                     * @param {Function} handler Function to call when the subscribed event is emitted.
                     * @param {Object} context Context to set 'this' to when calling the handler function.
                     */
                }, {
                    key: 'once',
                    value: function once(event, handler) {
                        var context = arguments.length <= 2 || arguments[2] === undefined ? this : arguments[2];

                        function onceWrapper() {
                            handler.call.apply(handler, [context].concat(_slice.call(arguments)));
                            this.off(event, onceWrapper);
                        }

                        return this.on(event, onceWrapper, this);
                    }

                    /**
                     * Unsubscribe to a previously subscribed event. If no handler or context is given, all handlers for
                     * the given event are removed. If no parameters are given at all, all event types will have their handlers removed.
                     * @param {String} event Event type to unsubscribe from. Allowed values are: 'value', 'child_changed', 'child_added', 'child_removed', 'child_moved'.
                     * @param {Function} handler Optional: Function that was used in previous subscription.
                     */
                }, {
                    key: 'off',
                    value: function off(event, handler) {
                        var boundHandler = this.handlers[handler];
                        this._orderedDataReference.off(event, boundHandler);
                    }

                    /**
                     * Sets the callback triggered when dataSource updates the data.
                     * @param {Function} callback Callback function to call when the subscribed data value changes.
                     * @deprecated Use the on() method instead.
                     * @returns {void}
                     **/
                }, {
                    key: 'setValueChangedCallback',
                    value: function setValueChangedCallback(callback) {
                        this._onValueCallback = callback;
                        this.on('value', callback);
                    }

                    /**
                     * Removes the callback set to trigger when dataSource updates the data.
                     * @deprecated Use the off() method instead.
                     * @returns {void}
                     **/
                }, {
                    key: 'removeValueChangedCallback',
                    value: function removeValueChangedCallback() {
                        if (this._onValueCallback) {
                            this.off('value', this._onValueCallback);
                            this._onValueCallback = null;
                        }
                    }

                    /**
                     * Set the callback triggered when dataSource adds a data element.
                     * @param {Function} callback Callback function to call when a new data child is added.
                     * @deprecated Use the on() method instead.
                     * @returns {void}
                     **/
                }, {
                    key: 'setChildAddedCallback',
                    value: function setChildAddedCallback(callback) {
                        this._onAddCallback = callback;
                        this.on('child_added', callback);
                    }

                    /**
                     * Removes the callback set to trigger when dataSource adds a data element.
                     * @deprecated Use the off() method instead.
                     * @returns {void}
                     **/
                }, {
                    key: 'removeChildAddedCallback',
                    value: function removeChildAddedCallback() {
                        if (this._onAddCallback) {
                            this.off('child_added', this._onAddCallback);
                            this._onAddCallback = null;
                        }
                    }

                    /**
                     * Set the callback triggered when dataSource changes a data element.
                     * @param {Function} callback Callback function to call when a child is changed.
                     * @deprecated Use the on() method instead.
                     * @returns {void}
                     **/
                }, {
                    key: 'setChildChangedCallback',
                    value: function setChildChangedCallback(callback) {
                        this._onChangeCallback = callback;
                        this.on('child_changed', callback);
                    }

                    /**
                     * Removes the callback set to trigger when dataSource changes a data element.
                     * @deprecated Use the off() method instead.
                     * @returns {void}
                     **/
                }, {
                    key: 'removeChildChangedCallback',
                    value: function removeChildChangedCallback() {
                        if (this._onChangeCallback) {
                            this.off('child_changed', this._onChangeCallback);
                            this._onChangeCallback = null;
                        }
                    }

                    /**
                     * Set the callback triggered when dataSource moves a data element.
                     * @param {Function} callback Callback function to call when a child is moved.
                     * @deprecated Use the on() method instead.
                     * @returns {void}
                     **/
                }, {
                    key: 'setChildMovedCallback',
                    value: function setChildMovedCallback(callback) {
                        this._onMoveCallback = callback;
                        this.on('child_moved', callback);
                    }

                    /**
                     * Removes the callback set to trigger when dataSource moves a data element.
                     * @deprecated Use the off() method instead.
                     * @returns {void}
                     **/
                }, {
                    key: 'removeChildMovedCallback',
                    value: function removeChildMovedCallback() {
                        if (this._onMoveCallback) {
                            this.off('child_moved', this._onMoveCallback);
                            this._onMoveCallback = null;
                        }
                    }

                    /**
                     * Set the callback triggered when dataSource removes a data element.
                     * @param {Function} callback Callback function to call when a child is removed.
                     * @deprecated Use the on() method instead.
                     * @returns {void}
                     **/
                }, {
                    key: 'setChildRemovedCallback',
                    value: function setChildRemovedCallback(callback) {
                        this._onRemoveCallback = callback;
                        this.on('child_removed', this._onRemoveCallback);
                    }

                    /**
                     * Removes the callback set to trigger when dataSource removes a data element.
                     * @deprecated Use the off() method instead.
                     * @returns {void}
                     **/
                }, {
                    key: 'removeChildRemovedCallback',
                    value: function removeChildRemovedCallback() {
                        if (this._onRemoveCallback) {
                            this.off('child_removed', this._onRemoveCallback);
                            this._onRemoveCallback = null;
                        }
                    }
                }]);

                var _FirebaseDataSource = FirebaseDataSource;
                FirebaseDataSource = provide(DataSource)(FirebaseDataSource) || FirebaseDataSource;
                return FirebaseDataSource;
            })(DataSource);

            _export('FirebaseDataSource', FirebaseDataSource);
        }
    };
});
System.register('src/datasources/SharePointDataSource.js', ['npm:babel-runtime@5.8.25/helpers/get.js', 'npm:babel-runtime@5.8.25/helpers/inherits.js', 'npm:babel-runtime@5.8.25/helpers/create-class.js', 'npm:babel-runtime@5.8.25/helpers/class-call-check.js', 'npm:babel-runtime@5.8.25/helpers/slice.js', 'github:bizboard/di.js@master.js', 'github:bizboard/arva-utils@1.0.0-beta-2/ObjectHelper.js', 'github:bizboard/arva-utils@1.0.0-beta-2/request/UrlParser.js', 'src/core/DataSource.js', 'github:bizboard/SPSoapAdapter@1.0.0-beta-2/SharePoint.js', 'src/datasources/SharePoint/SharePointSnapshot.js'], function (_export) {
    var _get, _inherits, _createClass, _classCallCheck, _slice, provide, ObjectHelper, UrlParser, DataSource, SharePoint, SharePointSnapshot, _currentUser, SharePointDataSource;

    return {
        setters: [function (_npmBabelRuntime5825HelpersGetJs) {
            _get = _npmBabelRuntime5825HelpersGetJs['default'];
        }, function (_npmBabelRuntime5825HelpersInheritsJs) {
            _inherits = _npmBabelRuntime5825HelpersInheritsJs['default'];
        }, function (_npmBabelRuntime5825HelpersCreateClassJs) {
            _createClass = _npmBabelRuntime5825HelpersCreateClassJs['default'];
        }, function (_npmBabelRuntime5825HelpersClassCallCheckJs) {
            _classCallCheck = _npmBabelRuntime5825HelpersClassCallCheckJs['default'];
        }, function (_npmBabelRuntime5825HelpersSliceJs) {
            _slice = _npmBabelRuntime5825HelpersSliceJs['default'];
        }, function (_githubBizboardDiJsMasterJs) {
            provide = _githubBizboardDiJsMasterJs.provide;
        }, function (_githubBizboardArvaUtils100Beta2ObjectHelperJs) {
            ObjectHelper = _githubBizboardArvaUtils100Beta2ObjectHelperJs.ObjectHelper;
        }, function (_githubBizboardArvaUtils100Beta2RequestUrlParserJs) {
            UrlParser = _githubBizboardArvaUtils100Beta2RequestUrlParserJs.UrlParser;
        }, function (_srcCoreDataSourceJs) {
            DataSource = _srcCoreDataSourceJs.DataSource;
        }, function (_githubBizboardSPSoapAdapter100Beta2SharePointJs) {
            SharePoint = _githubBizboardSPSoapAdapter100Beta2SharePointJs.SharePoint;
        }, function (_srcDatasourcesSharePointSharePointSnapshotJs) {
            SharePointSnapshot = _srcDatasourcesSharePointSharePointSnapshotJs.SharePointSnapshot;
        }],
        execute: function () {
            /**
             This Source Code is licensed under the MIT license. If a copy of the
             MIT-license was not distributed with this file, You can obtain one at:
             http://opensource.org/licenses/mit-license.html.
            
             @author: Hans van den Akker (mysim1)
             @license MIT
             @copyright Bizboard, 2015
            
             */

            'use strict';

            _currentUser = undefined;

            SharePointDataSource = (function (_DataSource) {
                _inherits(SharePointDataSource, _DataSource);

                _createClass(SharePointDataSource, null, [{
                    key: 'currentUser',
                    get: function get() {
                        return _currentUser;
                    },
                    set: function set(value) {
                        _currentUser = value;
                    }

                    /**
                     * @param {String} path Full path to resource in remote data storage.
                     * @return {SharePointDataSource} SharePointDataSource instance.
                     **/
                }]);

                function SharePointDataSource(path) {
                    var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

                    _classCallCheck(this, _SharePointDataSource);

                    _get(Object.getPrototypeOf(_SharePointDataSource.prototype), 'constructor', this).call(this, path);

                    this._dataReference = null;
                    this._callbacks = [];
                    this._onValueCallback = null;
                    this._onAddCallback = null;
                    this._onChangeCallback = null;
                    this._onMoveCallback = null;
                    this._onRemoveCallback = null;
                    this._originalPath = path;
                    this.options = options;

                    /* Bind all local methods to the current object instance, so we can refer to 'this'
                     * in the methods as expected, even when they're called from event handlers.        */
                    ObjectHelper.bindAllMethods(this, this);

                    /* Don't initialize this datasource when there is no path selected to retrieve data from. */
                    if (this.key().length > 0) {
                        var configuration = {
                            endPoint: this._originalPath,
                            listName: this.key()
                        };

                        if (this.options.query) {
                            configuration.query = this.options.query;
                        }

                        if (this.options.orderBy) {
                            configuration.orderBy = this.options.orderBy;
                        }

                        if (this.options.limit) {
                            configuration.limit = this.options.limit;
                        }

                        /* Bind the soap adapter against the datasource with given configuration */
                        this._dataReference = new SharePoint(configuration);
                    }
                }

                /**
                 * Indicate that the DataSource can be inherited when instantiating a list of models. By
                 * default we indicate false, which should trigger data model instantiation to create unique
                 * DataSource references to each model either in array or directly.
                 *
                 * If set to false, model updates trigger creation of a new DataSource instance. (default)
                 *
                 * @returns {Boolean} Whether the DataSource is inheritable.
                 */

                _createClass(SharePointDataSource, [{
                    key: 'toString',

                    /**
                     * Returns the full path to this dataSource's source on the remote storage provider.
                     * @returns {String} Full resource path.
                     */
                    value: function toString() {
                        return this._originalPath;
                    }

                    /**
                     * Returns a dataSource reference to the given child branch of the current dataSource.
                     * @param {String} childName Child branch name.
                     * @param {Object} options Optional: additional options to pass to new DataSource instance.
                     * @returns {DataSource} New dataSource instance pointing to the given child branch.
                     */
                }, {
                    key: 'child',
                    value: function child(childName) {
                        var options = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];

                        var childPath = '';
                        if (childName.indexOf('http') !== -1) {
                            childPath = childName.substring(1);
                        } else {
                            childPath += this._originalPath + '/' + childName;
                        }

                        return new SharePointDataSource(childPath, options || this.options);
                    }

                    /**
                     * Returns the full URL to the path on the dataSource. Functionally identical to toString().
                     * @returns {String} Full resource path.
                     */
                }, {
                    key: 'path',
                    value: function path() {
                        return this._originalPath;
                    }

                    /**
                     * Returns the name of the current branch in the path on the dataSource.
                     * @returns {String} Current branch name.
                     */
                }, {
                    key: 'key',
                    value: function key() {
                        var url = UrlParser(this._originalPath);
                        if (!url) {
                            console.log('Invalid datasource path provided!');
                        }

                        if (url.path.length === 0) {
                            return '';
                        }
                        var pathElements = url.path.split('/');
                        if (pathElements.length === 1) {
                            return url.path;
                        } else {
                            return url.path.split('/').pop();
                        }
                    }

                    /**
                     * Writes newData to the path this dataSource was constructed with.
                     * @param {Object} newData Data to write to dataSource.
                     * @returns {void}
                     */
                }, {
                    key: 'set',
                    value: function set(newData) {
                        this._dataReference.set(newData);
                        return this;
                    }

                    /**
                     * Removes the object and all underlying children that this dataSource points to.
                     * @param {Object} object The current object, needed because of a SharePointDataSource-specific issue. Will be refactored out in the future.
                     * @returns {void}
                     */
                }, {
                    key: 'remove',
                    value: function remove(object) {
                        this._dataReference.remove(object);
                    }

                    /**
                     * Writes newData to the path this dataSource was constructed with, appended by a random UID generated by
                     * the dataSource.
                     * @param {Object} newData New data to append to dataSource.
                     * @returns {SharePointDataSource}
                     */
                }, {
                    key: 'push',
                    value: function push(newData) {
                        var pushedData = this._dataReference.set(newData);
                        var newDataReference = new SharePointDataSource(this.path()).child('' + pushedData['_temporary-identifier']);

                        /* We need to set the SharePoint data reference's cache to the data we just pushed, so it can immediately emit a value
                         * once the newly created model subscribes to its own changes. This is needed to make Arva-ds' PrioArray.add() method work. */
                        newDataReference._dataReference.cache = pushedData;
                        return newDataReference;
                    }

                    /**
                     * Writes newData with given priority (ordering) to the path this dataSource was constructed with.
                     * @param {Object} newData New data to set.
                     * @param {String|Number} priority Priority value by which the data should be ordered.
                     * @returns {void}
                     */
                }, {
                    key: 'setWithPriority',
                    value: function setWithPriority(newData, priority) {
                        newData.priority = priority;
                        this.set(newData);
                    }

                    /**
                     * Sets the priority (ordering) of an object on a given dataSource.
                     * @param {String|Number} newPriority New priority value to order data by.
                     * @returns {void}
                     */
                }, {
                    key: 'setPriority',
                    value: function setPriority(newPriority) {
                        throw new Error('Not implemented');
                    }

                    /**
                     * Returns a new dataSource reference that will limit the subscription to only the first given amount items.
                     * @param {Number} amount Amount of items to limit the dataSource to.
                     * @returns {DataSource} New dataSource instance.
                     */
                }, {
                    key: 'limitToFirst',
                    value: function limitToFirst(amount) {
                        throw new Error('Not implemented');
                    }

                    /**
                     * Returns a new dataSource reference that will limit the subscription to only the last given amount items.
                     * @param {Number} amount Amount of items to limit the dataSource to.
                     * @returns {DataSource} New dataSource instance.
                     */
                }, {
                    key: 'limitToLast',
                    value: function limitToLast(amount) {
                        throw new Error('Not implemented');
                    }

                    /**
                     * Authenticates all instances of this DataSource with the given OAuth provider and credentials.
                     * @param {String} provider google, facebook, github, or twitter
                     * @param {String|Object} credentials Access token string, or object with key/value pairs with e.g. OAuth 1.1 credentials.
                     * @param {Function} onComplete Callback, executed when login is completed either successfully or erroneously.
                     * On error, first argument is error message.
                     * On success, the first argument is null, and the second argument is an object containing the fields uid, provider, auth, and expires.
                     * @param {Object} options Optional, additional client arguments, such as configuring session persistence.
                     * @returns {void}
                     */
                }, {
                    key: 'authWithOAuthToken',
                    value: function authWithOAuthToken(provider, credentials, onComplete, options) {
                        throw new Error('Not implemented');
                    }

                    /**
                     * Authenticates all instances of this DataSource with a custom auth token or secret.
                     * @param {String} authToken Authentication token or secret.
                     * @param {Function} onComplete Callback, executed when login is completed either successfully or erroneously.
                     * On error, first argument is error message.
                     * On success, the first argument is null, and the second argument is an object containing the fields uid, provider, auth, and expires.
                     * @param {Object} options Optional, additional client arguments, such as configuring session persistence.
                     * @returns {void}
                     */
                }, {
                    key: 'authWithCustomToken',
                    value: function authWithCustomToken(authToken, onComplete, options) {
                        throw new Error('Not implemented');
                    }

                    /**
                     * Authenticates all instances of this DataSource with the given email/password credentials.
                     * @param {String|Object} credentials Object with key/value pairs {email: 'value', password:'value'}.
                     * @param {Function} onComplete Callback, executed when login is completed either successfully or erroneously.
                     * On error, first argument is error message.
                     * On success, the first argument is null, and the second argument is an object containing the fields uid, provider, auth, and expires.
                     * @param {Object} options Optional, additional client arguments, such as configuring session persistence.
                     * @returns {void}
                     */
                }, {
                    key: 'authWithPassword',
                    value: function authWithPassword(credentials, onComplete, options) {
                        throw new Error('Not implemented');
                    }

                    /**
                     * Authenticates all instances of this DataSource as an anonymous user.
                     * @param {Function} onComplete Callback, executed when login is completed either successfully or erroneously.
                     * On error, first argument is error message.
                     * On success, the first argument is null, and the second argument is an object containing the fields uid, provider, auth, and expires.
                     * @param {Object} options Optional, additional client arguments, such as configuring session persistence.
                     * @returns {void}
                     */
                }, {
                    key: 'authAnonymously',
                    value: function authAnonymously(onComplete, options) {
                        throw new Error('Not implemented');
                    }

                    /**
                     * Fetches the current user's authentication state.
                     * If the user is authenticated, returns an object containing at least the fields uid, provider, auth, and expires.
                     * If the user is not authenticated, returns null.
                     * @returns {Object|null} User auth object.
                     */
                }, {
                    key: 'getAuth',
                    value: function getAuth() {
                        if (!SharePointDataSource.currentUser) {
                            this._dataReference.getAuth(function (authData) {
                                SharePointDataSource.currentUser = authData;
                            });
                        }

                        return SharePointDataSource.currentUser;
                    }

                    /**
                     * Logs out from the datasource, allowing to re-authenticate at a later time.
                     * @returns {void}
                     */
                }, {
                    key: 'unauth',
                    value: function unauth() {
                        throw new Error('Not implemented');
                    }

                    /**
                     * Subscribe to an event emitted by the DataSource.
                     * @param {String} event Event type to subscribe to. Allowed values are: 'value', 'child_changed', 'child_added', 'child_removed'.
                     * @param {Function} handler Function to call when the subscribed event is emitted.
                     * @param {Object} context Context to set 'this' to when calling the handler function.
                     */
                }, {
                    key: 'on',
                    value: function on(event, handler, context) {
                        var _this = this;

                        var callback = this._callbacks[handler] = function (data) {
                            var newChildSnapshot = new SharePointSnapshot(data, _this);
                            handler(newChildSnapshot);
                        };
                        this._dataReference.on(event, callback, context);
                    }

                    /**
                     * Subscribe to an event emitted by the DataSource once, and then immediately unsubscribe.
                     * @param {String} event Event type to subscribe to. Allowed values are: 'value', 'child_changed', 'child_added', 'child_removed'.
                     * @param {Function} handler Function to call when the subscribed event is emitted.
                     * @param {Object} context Context to set 'this' to when calling the handler function.
                     */
                }, {
                    key: 'once',
                    value: function once(event, handler) {
                        var context = arguments.length <= 2 || arguments[2] === undefined ? this : arguments[2];

                        var onceWrapper = (function () {
                            handler.call.apply(handler, [context].concat(_slice.call(arguments)));
                            this.off(event, onceWrapper);
                        }).bind(this);

                        return this.on(event, onceWrapper, this);
                    }

                    /**
                     * Unsubscribe to a previously subscribed event. If no handler or context is given, all handlers for
                     * the given event are removed. If no parameters are given at all, all event types will have their handlers removed.
                     * @param {String} event Event type to unsubscribe from. Allowed values are: 'value', 'child_changed', 'child_added', 'child_removed'.
                     * @param {Function} handler Optional: Function that was used in previous subscription.
                     */
                }, {
                    key: 'off',
                    value: function off(event, handler) {
                        var callback = this._callbacks[handler];
                        this._dataReference.off(event, callback);
                    }

                    /**
                     * Sets the callback triggered when dataSource updates the data.
                     * @param {Function} callback Callback function to call when the subscribed data value changes.
                     * @returns {void}
                     **/
                }, {
                    key: 'setValueChangedCallback',
                    value: function setValueChangedCallback(callback) {
                        var _this2 = this;

                        this._onValueCallback = function (data) {
                            var newChildSnapshot = new SharePointSnapshot(data, _this2);
                            callback(newChildSnapshot);
                        };
                        this._dataReference.on('value', this._onValueCallback);
                    }

                    /**
                     * Removes the callback set to trigger when dataSource updates the data.
                     * @returns {void}
                     **/
                }, {
                    key: 'removeValueChangedCallback',
                    value: function removeValueChangedCallback() {
                        if (this._onValueCallback) {
                            this._dataReference.off('value', this._onValueCallback);
                            this._onValueCallback = null;
                        }
                    }

                    /**
                     * Set the callback triggered when dataSource adds a data element.
                     * @param {Function} callback Callback function to call when a new data child is added.
                     * @returns {void}
                     **/
                }, {
                    key: 'setChildAddedCallback',
                    value: function setChildAddedCallback(callback) {
                        var _this3 = this;

                        this._onAddCallback = function (data, previousSiblingId) {
                            var newChildSnapshot = new SharePointSnapshot(data, _this3);
                            callback(newChildSnapshot, previousSiblingId);
                        };
                        this._dataReference.on('child_added', this._onAddCallback);
                    }

                    /**
                     * Removes the callback set to trigger when dataSource adds a data element.
                     * @returns {void}
                     **/
                }, {
                    key: 'removeChildAddedCallback',
                    value: function removeChildAddedCallback() {
                        if (this._onAddCallback) {
                            this._dataReference.off('child_added', this._onAddCallback);
                            this._onAddCallback = null;
                        }
                    }

                    /**
                     * Set the callback triggered when dataSource changes a data element.
                     * @param {Function} callback Callback function to call when a child is changed.
                     * @returns {void}
                     **/
                }, {
                    key: 'setChildChangedCallback',
                    value: function setChildChangedCallback(callback) {
                        var _this4 = this;

                        this._onChangeCallback = function (data, previousSiblingId) {
                            var newChildSnapshot = new SharePointSnapshot(data, _this4);
                            callback(newChildSnapshot, previousSiblingId);
                        };
                        this._dataReference.on('child_changed', this._onChangeCallback);
                    }

                    /**
                     * Removes the callback set to trigger when dataSource changes a data element.
                     * @returns {void}
                     **/
                }, {
                    key: 'removeChildChangedCallback',
                    value: function removeChildChangedCallback() {
                        if (this._onChangeCallback) {
                            this._dataReference.off('child_changed', this._onChangeCallback);
                            this._onChangeCallback = null;
                        }
                    }

                    /**
                     * Set the callback triggered when dataSource moves a data element.
                     * @param {Function} callback Callback function to call when a child is moved.
                     * @returns {void}
                     **/
                }, {
                    key: 'setChildMovedCallback',
                    value: function setChildMovedCallback(callback) {
                        console.warn('Not implemented');
                    }

                    /**
                     * Removes the callback set to trigger when dataSource moves a data element.
                     * @returns {void}
                     **/
                }, {
                    key: 'removeChildMovedCallback',
                    value: function removeChildMovedCallback() {
                        console.warn('Not implemented');
                    }

                    /**
                     * Set the callback triggered when dataSource removes a data element.
                     * @param {Function} callback Callback function to call when a child is removed.
                     * @returns {void}
                     **/
                }, {
                    key: 'setChildRemovedCallback',
                    value: function setChildRemovedCallback(callback) {
                        var _this5 = this;

                        this._onRemoveCallback = function (data) {
                            var removedChildSnapshot = new SharePointSnapshot(data, _this5);
                            callback(removedChildSnapshot);
                        };

                        this._dataReference.on('child_removed', this._onRemoveCallback);
                    }

                    /**
                     * Removes the callback set to trigger when dataSource removes a data element.
                     * @returns {void}
                     **/
                }, {
                    key: 'removeChildRemovedCallback',
                    value: function removeChildRemovedCallback() {
                        if (this._onRemoveCallback) {
                            this._dataReference.off('child_removed', this._onRemoveCallback);
                            this._onRemoveCallback = null;
                        }
                    }

                    /**
                     * Dummy method that just returns an empty string.
                     * @returns {String} Empty string.
                     */
                }, {
                    key: 'root',
                    value: function root() {
                        return '';
                    }
                }, {
                    key: '_notifyOnValue',
                    value: function _notifyOnValue(snapshot) {
                        if (this._onValueCallback) {
                            this._onValueCallback(snapshot);
                        }
                    }
                }, {
                    key: '_ParseSelector',
                    value: function _ParseSelector(path, endPoint) {}
                }, {
                    key: '_ParsePath',
                    value: function _ParsePath(path, endPoint) {

                        var url = UrlParser(path);
                        if (!url) {
                            console.log('Invalid datasource path provided!');
                        }

                        var pathParts = url.path.split('/');
                        var newPath = url.protocol + '://' + url.host + '/';
                        for (var i = 0; i < pathParts.length; i++) {
                            newPath += pathParts[i] + '/';
                        }
                        newPath += endPoint;
                        return newPath;
                    }
                }, {
                    key: 'inheritable',
                    get: function get() {
                        return true;
                    }
                }]);

                var _SharePointDataSource = SharePointDataSource;
                SharePointDataSource = provide(DataSource)(SharePointDataSource) || SharePointDataSource;
                return SharePointDataSource;
            })(DataSource);

            _export('SharePointDataSource', SharePointDataSource);
        }
    };
});
System.register('github:Bizboard/di.js@master/util.js', ['npm:babel-runtime@5.8.25/core-js/reflect/own-keys.js', 'npm:babel-runtime@5.8.25/core-js/object/get-own-property-names.js', 'npm:babel-runtime@5.8.25/core-js/object/get-own-property-symbols.js'], function (_export) {
  var _Reflect$ownKeys, _Object$getOwnPropertyNames, _Object$getOwnPropertySymbols, ownKeys;

  function isUpperCase(char) {
    return char.toUpperCase() === char;
  }

  function isFunction(value) {
    return typeof value === 'function';
  }

  function isObject(value) {
    return typeof value === 'object';
  }

  function toString(token) {
    if (typeof token === 'string') {
      return token;
    }

    if (token === undefined || token === null) {
      return '' + token;
    }

    if (token.name) {
      return token.name;
    }

    return token.toString();
  }

  return {
    setters: [function (_npmBabelRuntime5825CoreJsReflectOwnKeysJs) {
      _Reflect$ownKeys = _npmBabelRuntime5825CoreJsReflectOwnKeysJs['default'];
    }, function (_npmBabelRuntime5825CoreJsObjectGetOwnPropertyNamesJs) {
      _Object$getOwnPropertyNames = _npmBabelRuntime5825CoreJsObjectGetOwnPropertyNamesJs['default'];
    }, function (_npmBabelRuntime5825CoreJsObjectGetOwnPropertySymbolsJs) {
      _Object$getOwnPropertySymbols = _npmBabelRuntime5825CoreJsObjectGetOwnPropertySymbolsJs['default'];
    }],
    execute: function () {
      // A bunch of helper functions.
      'use strict';

      ownKeys = undefined && undefined.Reflect && _Reflect$ownKeys ? _Reflect$ownKeys : function ownKeys(O) {
        var keys = _Object$getOwnPropertyNames(O);
        if (_Object$getOwnPropertySymbols) return keys.concat(_Object$getOwnPropertySymbols(O));
        return keys;
      };

      _export('isUpperCase', isUpperCase);

      _export('isFunction', isFunction);

      _export('isObject', isObject);

      _export('toString', toString);

      _export('ownKeys', ownKeys);
    }
  };
});
System.register("src/core/DataSource.js", ["npm:babel-runtime@5.8.25/helpers/create-class.js", "npm:babel-runtime@5.8.25/helpers/class-call-check.js"], function (_export) {
  var _createClass, _classCallCheck, DataSource;

  return {
    setters: [function (_npmBabelRuntime5825HelpersCreateClassJs) {
      _createClass = _npmBabelRuntime5825HelpersCreateClassJs["default"];
    }, function (_npmBabelRuntime5825HelpersClassCallCheckJs) {
      _classCallCheck = _npmBabelRuntime5825HelpersClassCallCheckJs["default"];
    }],
    execute: function () {
      /**
       This Source Code is licensed under the MIT license. If a copy of the
       MIT-license was not distributed with this file, You can obtain one at:
       http://opensource.org/licenses/mit-license.html.
      
       @author: Tom Clement (tjclement)
       @license MIT
       @copyright Bizboard, 2015
      
       */

      "use strict";

      DataSource = (function () {

        /**
         * @param {String} path Full path to resource in remote data storage.
         * @return {DataSource} DataSource instance.
         **/

        function DataSource(path) {
          _classCallCheck(this, DataSource);

          this._dataReference = null;
        }

        /**
         * Indicate that the DataSource can be inherited when instantiating a list of models. By
         * default we indicate false, which should trigger data model instantiation to create unique
         * DataSource references to each model either in array or directly.
         *
         * If set to false, model updates trigger creation of a new DataSource instance. (default)
         *
         * @returns {Boolean} Whether the DataSource is inheritable.
         */

        _createClass(DataSource, [{
          key: "toString",

          /**
           * Returns the full path to this dataSource's source on the remote storage provider.
           * @returns {String} Full resource path.
           */
          value: function toString() {}

          /**
           * Returns a dataSource reference to the given child branch of the current dataSource.
           * @param {String} childName Child branch name.
           * @param {Object} options Optional: additional options to pass to new DataSource instance.
           * @returns {DataSource} New dataSource instance pointing to the given child branch.
           */
        }, {
          key: "child",
          value: function child(childName) {
            var options = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];
          }

          /**
           * Returns the full URL to the path on the dataSource. Functionally identical to toString().
           * @returns {String} Full resource path.
           */
        }, {
          key: "path",
          value: function path() {}

          /**
           * Returns the name of the current branch in the path on the dataSource.
           * @returns {String} Current branch name.
           */
        }, {
          key: "key",
          value: function key() {}

          /**
           * Writes newData to the path this dataSource was constructed with.
           * @param {Object} newData Data to write to dataSource.
           * @returns {void}
           */
        }, {
          key: "set",
          value: function set(newData) {}

          /**
           * Removes the object and all underlying children that this dataSource points to.
           * @returns {void}
           */
        }, {
          key: "remove",
          value: function remove() {}

          /**
           * Writes newData to the path this dataSource was constructed with, appended by a random UID generated by
           * the dataSource.
           * @param {Object} newData New data to append to dataSource.
           * @returns {void}
           */
        }, {
          key: "push",
          value: function push(newData) {}

          /**
           * Writes newData with given priority (ordering) to the path this dataSource was constructed with.
           * @param {Object} newData New data to set.
           * @param {String|Number} priority Priority value by which the data should be ordered.
           * @returns {void}
           */
        }, {
          key: "setWithPriority",
          value: function setWithPriority(newData, priority) {}

          /**
           * Sets the priority (ordering) of an object on a given dataSource.
           * @param {String|Number} newPriority New priority value to order data by.
           * @returns {void}
           */
        }, {
          key: "setPriority",
          value: function setPriority(newPriority) {}

          /**
           * Orders the DataSource's childs by the value in child[key].
           * @param {String} childKey Key of the field to order by.
           * @returns {DataSource} New dataSource instance.
           */
        }, {
          key: "orderByChild",
          value: function orderByChild(childKey) {}

          /**
           * Orders the DataSource's childs by their key names, ignoring their priority.
           * @returns {DataSource} New dataSource instance.
           */
        }, {
          key: "orderByKey",
          value: function orderByKey() {}

          /**
           * Orders the DataSource's childs by their values, ignoring their priority.
           * @returns {DataSource} New dataSource instance.
           */
        }, {
          key: "orderByValue",
          value: function orderByValue() {}

          /**
           * Returns a new dataSource reference that will limit the subscription to only the first given amount items.
           * @param {Number} amount Amount of items to limit the dataSource to.
           * @returns {DataSource} New dataSource instance.
           */
        }, {
          key: "limitToFirst",
          value: function limitToFirst(amount) {}

          /**
           * Returns a new dataSource reference that will limit the subscription to only the last given amount items.
           * @param {Number} amount Amount of items to limit the dataSource to.
           * @returns {DataSource} New dataSource instance.
           */
        }, {
          key: "limitToLast",
          value: function limitToLast(amount) {}

          /**
           * Authenticates all instances of this DataSource with the given OAuth provider and credentials.
           * @param {String} provider google, facebook, github, or twitter
           * @param {String|Object} credentials Access token string, or object with key/value pairs with e.g. OAuth 1.1 credentials.
           * @param {Function} onComplete Callback, executed when login is completed either successfully or erroneously.
           * On error, first argument is error message.
           * On success, the first argument is null, and the second argument is an object containing the fields uid, provider, auth, and expires.
           * @param {Object} options Optional, additional client arguments, such as configuring session persistence.
           * @returns {void}
           */
        }, {
          key: "authWithOAuthToken",
          value: function authWithOAuthToken(provider, credentials, onComplete, options) {}

          /**
           * Authenticates all instances of this DataSource with a custom auth token or secret.
           * @param {String} authToken Authentication token or secret.
           * @param {Function} onComplete Callback, executed when login is completed either successfully or erroneously.
           * On error, first argument is error message.
           * On success, the first argument is null, and the second argument is an object containing the fields uid, provider, auth, and expires.
           * @param {Object} options Optional, additional client arguments, such as configuring session persistence.
           * @returns {void}
           */
        }, {
          key: "authWithCustomToken",
          value: function authWithCustomToken(authToken, onComplete, options) {}

          /**
           * Authenticates all instances of this DataSource with the given email/password credentials.
           * @param {String|Object} credentials Object with key/value pairs {email: "value", password:"value"}.
           * @param {Function} onComplete Callback, executed when login is completed either successfully or erroneously.
           * On error, first argument is error message.
           * On success, the first argument is null, and the second argument is an object containing the fields uid, provider, auth, and expires.
           * @param {Object} options Optional, additional client arguments, such as configuring session persistence.
           * @returns {void}
           */
        }, {
          key: "authWithPassword",
          value: function authWithPassword(credentials, onComplete, options) {}

          /**
           * Authenticates all instances of this DataSource as an anonymous user.
           * @param {Function} onComplete Callback, executed when login is completed either successfully or erroneously.
           * On error, first argument is error message.
           * On success, the first argument is null, and the second argument is an object containing the fields uid, provider, auth, and expires.
           * @param {Object} options Optional, additional client arguments, such as configuring session persistence.
           * @returns {void}
           */
        }, {
          key: "authAnonymously",
          value: function authAnonymously(onComplete, options) {}

          /**
           * Fetches the current user's authentication state.
           * If the user is authenticated, returns an object containing at least the fields uid, provider, auth, and expires.
           * If the user is not authenticated, returns null.
           * @returns {Object|null} User auth object.
           */
        }, {
          key: "getAuth",
          value: function getAuth() {}

          /**
           * Logs out from the datasource, allowing to re-authenticate at a later time.
           * @returns {void}
           */
        }, {
          key: "unauth",
          value: function unauth() {}

          /**
           * Subscribe to an event emitted by the DataSource.
           * @param {String} event Event type to subscribe to. Allowed values are: 'value', 'child_changed', 'child_added', 'child_removed', 'child_moved'.
           * @param {Function} handler Function to call when the subscribed event is emitted.
           * @param {Object} context Context to set 'this' to when calling the handler function.
           */
        }, {
          key: "on",
          value: function on(event, handler, context) {}

          /**
           * Subscribe to an event emitted by the DataSource once, and then immediately unsubscribe.
           * @param {String} event Event type to subscribe to. Allowed values are: 'value', 'child_changed', 'child_added', 'child_removed', 'child_moved'.
           * @param {Function} handler Function to call when the subscribed event is emitted.
           * @param {Object} context Context to set 'this' to when calling the handler function.
           */
        }, {
          key: "once",
          value: function once(event, handler, context) {}

          /**
           * Unsubscribe to a previously subscribed event. If no handler or context is given, all handlers for
           * the given event are removed. If no parameters are given at all, all event types will have their handlers removed.
           * @param {String} event Event type to unsubscribe from. Allowed values are: 'value', 'child_changed', 'child_added', 'child_removed', 'child_moved'.
           * @param {Function} handler Optional: Function that was used in previous subscription.
           */
        }, {
          key: "off",
          value: function off(event, handler) {}

          /**
           * Sets the callback triggered when dataSource updates the data.
           * @param {Function} callback Callback function to call when the subscribed data value changes.
           * @returns {void}
           **/
        }, {
          key: "setValueChangedCallback",
          value: function setValueChangedCallback(callback) {}

          /**
           * Removes the callback set to trigger when dataSource updates the data.
           * @returns {void}
           **/
        }, {
          key: "removeValueChangedCallback",
          value: function removeValueChangedCallback() {}

          /**
           * Set the callback triggered when dataSource adds a data element.
           * @param {Function} callback Callback function to call when a new data child is added.
           * @returns {void}
           **/
        }, {
          key: "setChildAddedCallback",
          value: function setChildAddedCallback(callback) {}

          /**
           * Removes the callback set to trigger when dataSource adds a data element.
           * @returns {void}
           **/
        }, {
          key: "removeChildAddedCallback",
          value: function removeChildAddedCallback() {}

          /**
           * Set the callback triggered when dataSource changes a data element.
           * @param {Function} callback Callback function to call when a child is changed.
           * @returns {void}
           **/
        }, {
          key: "setChildChangedCallback",
          value: function setChildChangedCallback(callback) {}

          /**
           * Removes the callback set to trigger when dataSource changes a data element.
           * @returns {void}
           **/
        }, {
          key: "removeChildChangedCallback",
          value: function removeChildChangedCallback() {}

          /**
           * Set the callback triggered when dataSource moves a data element.
           * @param {Function} callback Callback function to call when a child is moved.
           * @returns {void}
           **/
        }, {
          key: "setChildMovedCallback",
          value: function setChildMovedCallback(callback) {}

          /**
           * Removes the callback set to trigger when dataSource moves a data element.
           * @returns {void}
           **/
        }, {
          key: "removeChildMovedCallback",
          value: function removeChildMovedCallback() {}

          /**
           * Set the callback triggered when dataSource removes a data element.
           * @param {Function} callback Callback function to call when a child is removed.
           * @returns {void}
           **/
        }, {
          key: "setChildRemovedCallback",
          value: function setChildRemovedCallback(callback) {}

          /**
           * Removes the callback set to trigger when dataSource removes a data element.
           * @returns {void}
           **/
        }, {
          key: "removeChildRemovedCallback",
          value: function removeChildRemovedCallback() {}
        }, {
          key: "inheritable",
          get: function get() {
            return false;
          }
        }]);

        return DataSource;
      })();

      _export("DataSource", DataSource);
    }
  };
});
System.register('github:Bizboard/di.js@master/annotations.js', ['npm:babel-runtime@5.8.25/helpers/class-call-check.js', 'npm:babel-runtime@5.8.25/helpers/get.js', 'npm:babel-runtime@5.8.25/helpers/inherits.js', 'npm:babel-runtime@5.8.25/helpers/bind.js', 'npm:babel-runtime@5.8.25/core-js/get-iterator.js', 'github:Bizboard/di.js@master/util.js'], function (_export) {
  var _classCallCheck, _get, _inherits, _bind, _getIterator, isFunction, SuperConstructor, TransientScope, Inject, InjectPromise, InjectLazy, Provide, ProvidePromise, ClassProvider, FactoryProvider;

  // HELPERS

  // Append annotation on a function or class.
  // This can be helpful when not using ES6+.
  function annotate(fn, annotation) {
    fn.annotations = fn.annotations || [];
    fn.annotations.push(annotation);
  }

  // Read annotations on a function or class and return whether given annotation is present.
  function hasAnnotation(fn, annotationClass) {
    if (!fn.annotations || fn.annotations.length === 0) {
      return false;
    }

    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = _getIterator(fn.annotations), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var annotation = _step.value;

        if (annotation instanceof annotationClass) {
          return true;
        }
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator['return']) {
          _iterator['return']();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }

    return false;
  }

  // Read annotations on a function or class and collect "interesting" metadata:
  function readAnnotations(fn) {
    var collectedAnnotations = {
      // Description of the provided value.
      provide: {
        token: null,
        isPromise: false
      },

      // List of parameter descriptions.
      // A parameter description is an object with properties:
      // - token (anything)
      // - isPromise (boolean)
      // - isLazy (boolean)
      params: []
    };

    if (fn.annotations && fn.annotations.length) {
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = _getIterator(fn.annotations), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var annotation = _step2.value;

          if (annotation instanceof Inject) {
            annotation.tokens.forEach(function (token) {
              collectedAnnotations.params.push({
                token: token,
                isPromise: annotation.isPromise,
                isLazy: annotation.isLazy
              });
            });
          }

          if (annotation instanceof Provide) {
            collectedAnnotations.provide.token = annotation.token;
            collectedAnnotations.provide.isPromise = annotation.isPromise;
          }
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2['return']) {
            _iterator2['return']();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }
    }

    // Read annotations for individual parameters.
    if (fn.parameters) {
      fn.parameters.forEach(function (param, idx) {
        var _iteratorNormalCompletion3 = true;
        var _didIteratorError3 = false;
        var _iteratorError3 = undefined;

        try {
          for (var _iterator3 = _getIterator(param), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
            var paramAnnotation = _step3.value;

            // Type annotation.
            if (isFunction(paramAnnotation) && !collectedAnnotations.params[idx]) {
              collectedAnnotations.params[idx] = {
                token: paramAnnotation,
                isPromise: false,
                isLazy: false
              };
            } else if (paramAnnotation instanceof Inject) {
              collectedAnnotations.params[idx] = {
                token: paramAnnotation.tokens[0],
                isPromise: paramAnnotation.isPromise,
                isLazy: paramAnnotation.isLazy
              };
            }
          }
        } catch (err) {
          _didIteratorError3 = true;
          _iteratorError3 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion3 && _iterator3['return']) {
              _iterator3['return']();
            }
          } finally {
            if (_didIteratorError3) {
              throw _iteratorError3;
            }
          }
        }
      });
    }

    return collectedAnnotations;
  }

  // Decorator versions of annotation classes
  function inject() {
    for (var _len4 = arguments.length, tokens = Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
      tokens[_key4] = arguments[_key4];
    }

    return function (fn) {
      annotate(fn, new (_bind.apply(Inject, [null].concat(tokens)))());
    };
  }

  function inject() {
    for (var _len5 = arguments.length, tokens = Array(_len5), _key5 = 0; _key5 < _len5; _key5++) {
      tokens[_key5] = arguments[_key5];
    }

    return function (fn) {
      annotate(fn, new (_bind.apply(Inject, [null].concat(tokens)))());
    };
  }

  function injectPromise() {
    for (var _len6 = arguments.length, tokens = Array(_len6), _key6 = 0; _key6 < _len6; _key6++) {
      tokens[_key6] = arguments[_key6];
    }

    return function (fn) {
      annotate(fn, new (_bind.apply(InjectPromise, [null].concat(tokens)))());
    };
  }

  function injectLazy() {
    for (var _len7 = arguments.length, tokens = Array(_len7), _key7 = 0; _key7 < _len7; _key7++) {
      tokens[_key7] = arguments[_key7];
    }

    return function (fn) {
      annotate(fn, new (_bind.apply(InjectLazy, [null].concat(tokens)))());
    };
  }

  function provide() {
    for (var _len8 = arguments.length, tokens = Array(_len8), _key8 = 0; _key8 < _len8; _key8++) {
      tokens[_key8] = arguments[_key8];
    }

    return function (fn) {
      annotate(fn, new (_bind.apply(Provide, [null].concat(tokens)))());
    };
  }

  function providePromise() {
    for (var _len9 = arguments.length, tokens = Array(_len9), _key9 = 0; _key9 < _len9; _key9++) {
      tokens[_key9] = arguments[_key9];
    }

    return function (fn) {
      annotate(fn, new (_bind.apply(ProvidePromise, [null].concat(tokens)))());
    };
  }

  return {
    setters: [function (_npmBabelRuntime5825HelpersClassCallCheckJs) {
      _classCallCheck = _npmBabelRuntime5825HelpersClassCallCheckJs['default'];
    }, function (_npmBabelRuntime5825HelpersGetJs) {
      _get = _npmBabelRuntime5825HelpersGetJs['default'];
    }, function (_npmBabelRuntime5825HelpersInheritsJs) {
      _inherits = _npmBabelRuntime5825HelpersInheritsJs['default'];
    }, function (_npmBabelRuntime5825HelpersBindJs) {
      _bind = _npmBabelRuntime5825HelpersBindJs['default'];
    }, function (_npmBabelRuntime5825CoreJsGetIteratorJs) {
      _getIterator = _npmBabelRuntime5825CoreJsGetIteratorJs['default'];
    }, function (_githubBizboardDiJsMasterUtilJs) {
      isFunction = _githubBizboardDiJsMasterUtilJs.isFunction;
    }],
    execute: function () {
      /* */

      // This module contains:
      // - built-in annotation classes
      // - helpers to read/write annotations

      // ANNOTATIONS

      // A built-in token.
      // Used to ask for pre-injected parent constructor.
      // A class constructor can ask for this.
      'use strict';

      SuperConstructor = function SuperConstructor() {
        _classCallCheck(this, SuperConstructor);
      }

      // A built-in scope.
      // Never cache.
      ;

      TransientScope = function TransientScope() {
        _classCallCheck(this, TransientScope);
      };

      Inject = function Inject() {
        _classCallCheck(this, Inject);

        for (var _len = arguments.length, tokens = Array(_len), _key = 0; _key < _len; _key++) {
          tokens[_key] = arguments[_key];
        }

        this.tokens = tokens;
        this.isPromise = false;
        this.isLazy = false;
      };

      InjectPromise = (function (_Inject) {
        _inherits(InjectPromise, _Inject);

        function InjectPromise() {
          _classCallCheck(this, InjectPromise);

          _get(Object.getPrototypeOf(InjectPromise.prototype), 'constructor', this).call(this);

          for (var _len2 = arguments.length, tokens = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
            tokens[_key2] = arguments[_key2];
          }

          this.tokens = tokens;
          this.isPromise = true;
          this.isLazy = false;
        }

        return InjectPromise;
      })(Inject);

      InjectLazy = (function (_Inject2) {
        _inherits(InjectLazy, _Inject2);

        function InjectLazy() {
          _classCallCheck(this, InjectLazy);

          _get(Object.getPrototypeOf(InjectLazy.prototype), 'constructor', this).call(this);

          for (var _len3 = arguments.length, tokens = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
            tokens[_key3] = arguments[_key3];
          }

          this.tokens = tokens;
          this.isPromise = false;
          this.isLazy = true;
        }

        return InjectLazy;
      })(Inject);

      Provide = function Provide(token) {
        _classCallCheck(this, Provide);

        this.token = token;
        this.isPromise = false;
      };

      ProvidePromise = (function (_Provide) {
        _inherits(ProvidePromise, _Provide);

        function ProvidePromise(token) {
          _classCallCheck(this, ProvidePromise);

          _get(Object.getPrototypeOf(ProvidePromise.prototype), 'constructor', this).call(this);
          this.token = token;
          this.isPromise = true;
        }

        return ProvidePromise;
      })(Provide);

      ClassProvider = function ClassProvider() {
        _classCallCheck(this, ClassProvider);
      };

      FactoryProvider = function FactoryProvider() {
        _classCallCheck(this, FactoryProvider);
      };

      _export('annotate', annotate);

      _export('hasAnnotation', hasAnnotation);

      _export('readAnnotations', readAnnotations);

      _export('SuperConstructor', SuperConstructor);

      _export('TransientScope', TransientScope);

      _export('Inject', Inject);

      _export('InjectPromise', InjectPromise);

      _export('InjectLazy', InjectLazy);

      _export('Provide', Provide);

      _export('ProvidePromise', ProvidePromise);

      _export('ClassProvider', ClassProvider);

      _export('FactoryProvider', FactoryProvider);

      _export('inject', inject);

      _export('injectPromise', injectPromise);

      _export('injectLazy', injectLazy);

      _export('provide', provide);

      _export('providePromise', providePromise);
    }
  };
});
System.register('github:Bizboard/di.js@master/injector.js', ['npm:babel-runtime@5.8.25/helpers/create-class.js', 'npm:babel-runtime@5.8.25/helpers/class-call-check.js', 'npm:babel-runtime@5.8.25/core-js/map.js', 'npm:babel-runtime@5.8.25/core-js/get-iterator.js', 'npm:babel-runtime@5.8.25/core-js/promise.js', 'github:Bizboard/di.js@master/annotations.js', 'github:Bizboard/di.js@master/util.js', 'github:Bizboard/di.js@master/profiler.js', 'github:Bizboard/di.js@master/providers.js'], function (_export) {
  var _createClass, _classCallCheck, _Map, _getIterator, _Promise, annotate, readAnnotations, hasAnnotation, ProvideAnnotation, TransientScopeAnnotation, isFunction, toString, profileInjector, createProviderFromFnOrClass, Injector;

  function constructResolvingMessage(resolving, token) {
    // If a token is passed in, add it into the resolving array.
    // We need to check arguments.length because it can be null/undefined.
    if (arguments.length > 1) {
      resolving.push(token);
    }

    if (resolving.length > 1) {
      return ' (' + resolving.map(toString).join(' -> ') + ')';
    }

    return '';
  }

  // Injector encapsulate a life scope.
  // There is exactly one instance for given token in given injector.
  //
  // All the state is immutable, the only state changes is the cache. There is however no way to produce different instance under given token. In that sense it is immutable.
  //
  // Injector is responsible for:
  // - resolving tokens into
  //   - provider
  //   - value (cache/calling provider)
  // - dealing with isPromise
  // - dealing with isLazy
  // - loading different "providers" and modules
  return {
    setters: [function (_npmBabelRuntime5825HelpersCreateClassJs) {
      _createClass = _npmBabelRuntime5825HelpersCreateClassJs['default'];
    }, function (_npmBabelRuntime5825HelpersClassCallCheckJs) {
      _classCallCheck = _npmBabelRuntime5825HelpersClassCallCheckJs['default'];
    }, function (_npmBabelRuntime5825CoreJsMapJs) {
      _Map = _npmBabelRuntime5825CoreJsMapJs['default'];
    }, function (_npmBabelRuntime5825CoreJsGetIteratorJs) {
      _getIterator = _npmBabelRuntime5825CoreJsGetIteratorJs['default'];
    }, function (_npmBabelRuntime5825CoreJsPromiseJs) {
      _Promise = _npmBabelRuntime5825CoreJsPromiseJs['default'];
    }, function (_githubBizboardDiJsMasterAnnotationsJs) {
      annotate = _githubBizboardDiJsMasterAnnotationsJs.annotate;
      readAnnotations = _githubBizboardDiJsMasterAnnotationsJs.readAnnotations;
      hasAnnotation = _githubBizboardDiJsMasterAnnotationsJs.hasAnnotation;
      ProvideAnnotation = _githubBizboardDiJsMasterAnnotationsJs.Provide;
      TransientScopeAnnotation = _githubBizboardDiJsMasterAnnotationsJs.TransientScope;
    }, function (_githubBizboardDiJsMasterUtilJs) {
      isFunction = _githubBizboardDiJsMasterUtilJs.isFunction;
      toString = _githubBizboardDiJsMasterUtilJs.toString;
    }, function (_githubBizboardDiJsMasterProfilerJs) {
      profileInjector = _githubBizboardDiJsMasterProfilerJs.profileInjector;
    }, function (_githubBizboardDiJsMasterProvidersJs) {
      createProviderFromFnOrClass = _githubBizboardDiJsMasterProvidersJs.createProviderFromFnOrClass;
    }],
    execute: function () {
      /* */
      'use strict';

      Injector = (function () {
        function Injector() {
          var modules = arguments.length <= 0 || arguments[0] === undefined ? [] : arguments[0];
          var parentInjector = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];
          var providers = arguments.length <= 2 || arguments[2] === undefined ? new _Map() : arguments[2];
          var scopes = arguments.length <= 3 || arguments[3] === undefined ? [] : arguments[3];

          _classCallCheck(this, Injector);

          this._cache = new _Map();
          this._providers = providers;
          this._parent = parentInjector;
          this._scopes = scopes;

          this._loadModules(modules);

          profileInjector(this, Injector);
        }

        // Collect all registered providers that has given annotation.
        // Including providers defined in parent injectors.

        _createClass(Injector, [{
          key: '_collectProvidersWithAnnotation',
          value: function _collectProvidersWithAnnotation(annotationClass, collectedProviders) {
            this._providers.forEach(function (provider, token) {
              if (!collectedProviders.has(token) && hasAnnotation(provider.provider, annotationClass)) {
                collectedProviders.set(token, provider);
              }
            });

            if (this._parent) {
              this._parent._collectProvidersWithAnnotation(annotationClass, collectedProviders);
            }
          }

          // Load modules/function/classes.
          // This mutates `this._providers`, but it is only called during the constructor.
        }, {
          key: '_loadModules',
          value: function _loadModules(modules) {
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
              for (var _iterator = _getIterator(modules), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                var module = _step.value;

                // A single provider (class or function).
                if (isFunction(module)) {
                  this._loadFnOrClass(module);
                  continue;
                }

                throw new Error('Invalid module!');
              }
            } catch (err) {
              _didIteratorError = true;
              _iteratorError = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion && _iterator['return']) {
                  _iterator['return']();
                }
              } finally {
                if (_didIteratorError) {
                  throw _iteratorError;
                }
              }
            }
          }

          // Load a function or class.
          // This mutates `this._providers`, but it is only called during the constructor.
        }, {
          key: '_loadFnOrClass',
          value: function _loadFnOrClass(fnOrClass) {
            // TODO(vojta): should we expose provider.token?
            var annotations = readAnnotations(fnOrClass);
            var token = annotations.provide.token || fnOrClass;
            var provider = createProviderFromFnOrClass(fnOrClass, annotations);

            this._providers.set(token, provider);
          }

          // Returns true if there is any provider registered for given token.
          // Including parent injectors.
        }, {
          key: '_hasProviderFor',
          value: function _hasProviderFor(token) {
            if (this._providers.has(token)) {
              return true;
            }

            if (this._parent) {
              return this._parent._hasProviderFor(token);
            }

            return false;
          }

          // Find the correct injector where the default provider should be instantiated and cached.
        }, {
          key: '_instantiateDefaultProvider',
          value: function _instantiateDefaultProvider(provider, token, resolving, wantPromise, wantLazy) {
            // In root injector, instantiate here.
            if (!this._parent) {
              this._providers.set(token, provider);
              return this.get(token, resolving, wantPromise, wantLazy);
            }

            // Check if this injector forces new instance of this provider.
            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
              for (var _iterator2 = _getIterator(this._scopes), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                var ScopeClass = _step2.value;

                if (hasAnnotation(provider.provider, ScopeClass)) {
                  this._providers.set(token, provider);
                  return this.get(token, resolving, wantPromise, wantLazy);
                }
              }

              // Otherwise ask parent injector.
            } catch (err) {
              _didIteratorError2 = true;
              _iteratorError2 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion2 && _iterator2['return']) {
                  _iterator2['return']();
                }
              } finally {
                if (_didIteratorError2) {
                  throw _iteratorError2;
                }
              }
            }

            return this._parent._instantiateDefaultProvider(provider, token, resolving, wantPromise, wantLazy);
          }

          // Return an instance for given token.
        }, {
          key: 'get',
          value: function get(token) {
            var resolving = arguments.length <= 1 || arguments[1] === undefined ? [] : arguments[1];

            var _this = this;

            var wantPromise = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];
            var wantLazy = arguments.length <= 3 || arguments[3] === undefined ? false : arguments[3];

            var resolvingMsg = '';
            var provider;
            var instance;
            var injector = this;

            if (token === null || token === undefined) {
              resolvingMsg = constructResolvingMessage(resolving, token);
              throw new Error('Invalid token "' + token + '" requested!' + resolvingMsg);
            }

            // Special case, return itself.
            if (token === Injector) {
              if (wantPromise) {
                return _Promise.resolve(this);
              }

              return this;
            }

            // TODO(vojta): optimize - no child injector for locals?
            if (wantLazy) {
              return function createLazyInstance() {
                var lazyInjector = injector;

                if (arguments.length) {
                  var locals = [];
                  var args = arguments;

                  for (var i = 0; i < args.length; i += 2) {
                    locals.push((function (ii) {
                      var fn = function createLocalInstance() {
                        return args[ii + 1];
                      };

                      annotate(fn, new ProvideAnnotation(args[ii]));

                      return fn;
                    })(i));
                  }

                  lazyInjector = injector.createChild(locals);
                }

                return lazyInjector.get(token, resolving, wantPromise, false);
              };
            }

            // Check if there is a cached instance already.
            if (this._cache.has(token)) {
              instance = this._cache.get(token);
              provider = this._providers.get(token);

              if (provider.isPromise && !wantPromise) {
                resolvingMsg = constructResolvingMessage(resolving, token);
                throw new Error('Cannot instantiate ' + toString(token) + ' synchronously. It is provided as a promise!' + resolvingMsg);
              }

              if (!provider.isPromise && wantPromise) {
                return _Promise.resolve(instance);
              }

              return instance;
            }

            provider = this._providers.get(token);

            // No provider defined (overridden), use the default provider (token).
            if (!provider && isFunction(token) && !this._hasProviderFor(token)) {
              provider = createProviderFromFnOrClass(token, readAnnotations(token));
              return this._instantiateDefaultProvider(provider, token, resolving, wantPromise, wantLazy);
            }

            if (!provider) {
              if (!this._parent) {
                resolvingMsg = constructResolvingMessage(resolving, token);
                throw new Error('No provider for ' + toString(token) + '!' + resolvingMsg);
              }

              return this._parent.get(token, resolving, wantPromise, wantLazy);
            }

            if (resolving.indexOf(token) !== -1) {
              resolvingMsg = constructResolvingMessage(resolving, token);
              throw new Error('Cannot instantiate cyclic dependency!' + resolvingMsg);
            }

            resolving.push(token);

            // TODO(vojta): handle these cases:
            // 1/
            // - requested as promise (delayed)
            // - requested again as promise (before the previous gets resolved) -> cache the promise
            // 2/
            // - requested as promise (delayed)
            // - requested again sync (before the previous gets resolved)
            // -> error, but let it go inside to throw where exactly is the async provider
            var delayingInstantiation = wantPromise && provider.params.some(function (param) {
              return !param.isPromise;
            });
            var args = provider.params.map(function (param) {

              if (delayingInstantiation) {
                return _this.get(param.token, resolving, true, param.isLazy);
              }

              return _this.get(param.token, resolving, param.isPromise, param.isLazy);
            });

            // Delaying the instantiation - return a promise.
            if (delayingInstantiation) {
              var delayedResolving = resolving.slice(); // clone

              resolving.pop();

              // Once all dependencies (promises) are resolved, instantiate.
              return _Promise.all(args).then(function (args) {
                try {
                  instance = provider.create(args);
                } catch (e) {
                  resolvingMsg = constructResolvingMessage(delayedResolving);
                  var originalMsg = 'ORIGINAL ERROR: ' + e.message;
                  e.message = 'Error during instantiation of ' + toString(token) + '!' + resolvingMsg + '\n' + originalMsg;
                  throw e;
                }

                if (!hasAnnotation(provider.provider, TransientScopeAnnotation)) {
                  injector._cache.set(token, instance);
                }

                // TODO(vojta): if a provider returns a promise (but is not declared as @ProvidePromise),
                // here the value will get unwrapped (because it is returned from a promise callback) and
                // the actual value will be injected. This is probably not desired behavior. Maybe we could
                // get rid off the @ProvidePromise and just check the returned value, whether it is
                // a promise or not.
                return instance;
              });
            }

            try {
              instance = provider.create(args);
            } catch (e) {
              resolvingMsg = constructResolvingMessage(resolving);
              var originalMsg = 'ORIGINAL ERROR: ' + e.message;
              e.message = 'Error during instantiation of ' + toString(token) + '!' + resolvingMsg + '\n' + originalMsg;
              throw e;
            }

            if (!hasAnnotation(provider.provider, TransientScopeAnnotation)) {
              this._cache.set(token, instance);
            }

            if (!wantPromise && provider.isPromise) {
              resolvingMsg = constructResolvingMessage(resolving);

              throw new Error('Cannot instantiate ' + toString(token) + ' synchronously. It is provided as a promise!' + resolvingMsg);
            }

            if (wantPromise && !provider.isPromise) {
              instance = _Promise.resolve(instance);
            }

            resolving.pop();

            return instance;
          }
        }, {
          key: 'getPromise',
          value: function getPromise(token) {
            return this.get(token, [], true);
          }

          // Create a child injector, which encapsulate shorter life scope.
          // It is possible to add additional providers and also force new instances of existing providers.
        }, {
          key: 'createChild',
          value: function createChild() {
            var modules = arguments.length <= 0 || arguments[0] === undefined ? [] : arguments[0];
            var forceNewInstancesOf = arguments.length <= 1 || arguments[1] === undefined ? [] : arguments[1];

            var forcedProviders = new _Map();

            // Always force new instance of TransientScope.
            forceNewInstancesOf.push(TransientScopeAnnotation);

            var _iteratorNormalCompletion3 = true;
            var _didIteratorError3 = false;
            var _iteratorError3 = undefined;

            try {
              for (var _iterator3 = _getIterator(forceNewInstancesOf), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                var annotation = _step3.value;

                this._collectProvidersWithAnnotation(annotation, forcedProviders);
              }
            } catch (err) {
              _didIteratorError3 = true;
              _iteratorError3 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion3 && _iterator3['return']) {
                  _iterator3['return']();
                }
              } finally {
                if (_didIteratorError3) {
                  throw _iteratorError3;
                }
              }
            }

            return new Injector(modules, this, forcedProviders, forceNewInstancesOf);
          }
        }]);

        return Injector;
      })();

      _export('Injector', Injector);
    }
  };
});
System.register('github:Bizboard/di.js@master/index.js', ['github:Bizboard/di.js@master/injector.js', 'github:Bizboard/di.js@master/annotations.js'], function (_export) {
  // PUBLIC API

  'use strict';

  return {
    setters: [function (_githubBizboardDiJsMasterInjectorJs) {
      var _exportObj = {};
      _exportObj['Injector'] = _githubBizboardDiJsMasterInjectorJs.Injector;

      _export(_exportObj);
    }, function (_githubBizboardDiJsMasterAnnotationsJs) {
      var _exportObj2 = {};
      _exportObj2['annotate'] = _githubBizboardDiJsMasterAnnotationsJs.annotate;
      _exportObj2['Inject'] = _githubBizboardDiJsMasterAnnotationsJs.Inject;
      _exportObj2['InjectLazy'] = _githubBizboardDiJsMasterAnnotationsJs.InjectLazy;
      _exportObj2['InjectPromise'] = _githubBizboardDiJsMasterAnnotationsJs.InjectPromise;
      _exportObj2['Provide'] = _githubBizboardDiJsMasterAnnotationsJs.Provide;
      _exportObj2['ProvidePromise'] = _githubBizboardDiJsMasterAnnotationsJs.ProvidePromise;
      _exportObj2['SuperConstructor'] = _githubBizboardDiJsMasterAnnotationsJs.SuperConstructor;
      _exportObj2['TransientScope'] = _githubBizboardDiJsMasterAnnotationsJs.TransientScope;
      _exportObj2['ClassProvider'] = _githubBizboardDiJsMasterAnnotationsJs.ClassProvider;
      _exportObj2['FactoryProvider'] = _githubBizboardDiJsMasterAnnotationsJs.FactoryProvider;
      _exportObj2['inject'] = _githubBizboardDiJsMasterAnnotationsJs.inject;
      _exportObj2['injectPromise'] = _githubBizboardDiJsMasterAnnotationsJs.injectPromise;
      _exportObj2['injectLazy'] = _githubBizboardDiJsMasterAnnotationsJs.injectLazy;
      _exportObj2['provide'] = _githubBizboardDiJsMasterAnnotationsJs.provide;
      _exportObj2['providePromise'] = _githubBizboardDiJsMasterAnnotationsJs.providePromise;

      _export(_exportObj2);
    }],
    execute: function () {}
  };
});
System.register("github:bizboard/di.js@master.js", ["github:Bizboard/di.js@master/index.js"], function (_export) {
  "use strict";

  return {
    setters: [function (_githubBizboardDiJsMasterIndexJs) {
      var _exportObj = {};

      for (var _key in _githubBizboardDiJsMasterIndexJs) {
        if (_key !== "default") _exportObj[_key] = _githubBizboardDiJsMasterIndexJs[_key];
      }

      _export(_exportObj);
    }],
    execute: function () {}
  };
});
System.register('github:bizboard/arva-utils@1.0.0-beta-2/Context.js', ['npm:babel-runtime@5.8.25/helpers/create-class.js', 'npm:babel-runtime@5.8.25/helpers/class-call-check.js', 'github:bizboard/di.js@master.js'], function (_export) {
    var _createClass, _classCallCheck, Injector, contextContainer, Context;

    return {
        setters: [function (_npmBabelRuntime5825HelpersCreateClassJs) {
            _createClass = _npmBabelRuntime5825HelpersCreateClassJs['default'];
        }, function (_npmBabelRuntime5825HelpersClassCallCheckJs) {
            _classCallCheck = _npmBabelRuntime5825HelpersClassCallCheckJs['default'];
        }, function (_githubBizboardDiJsMasterJs) {
            Injector = _githubBizboardDiJsMasterJs.Injector;
        }],
        execute: function () {
            /**
             This Source Code is licensed under the MIT license. If a copy of the
             MIT-license was not distributed with this file, You can obtain one at:
             http://opensource.org/licenses/mit-license.html.
            
             @author: Hans van den Akker (mysim1)
             @license MIT
             @copyright Bizboard, 2015
            
             */

            'use strict';

            contextContainer = {};

            Context = (function () {
                function Context() {
                    _classCallCheck(this, Context);
                }

                _createClass(Context, null, [{
                    key: 'getContext',
                    value: function getContext() {
                        var contextName = arguments.length <= 0 || arguments[0] === undefined ? 'Default' : arguments[0];

                        return contextContainer[contextName];
                    }
                }, {
                    key: 'setContext',
                    value: function setContext() {
                        var context = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];
                        var contextName = arguments.length <= 1 || arguments[1] === undefined ? 'Default' : arguments[1];

                        return contextContainer[contextName] = context;
                    }
                }, {
                    key: 'buildContext',
                    value: function buildContext() {
                        var dependencies = arguments.length <= 0 || arguments[0] === undefined ? [] : arguments[0];
                        var contextName = arguments.length <= 1 || arguments[1] === undefined ? 'Default' : arguments[1];

                        return Context.setContext(new Injector(dependencies), contextName);
                    }
                }]);

                return Context;
            })();

            _export('Context', Context);
        }
    };
});
System.register('src/core/Model.js', ['npm:babel-runtime@5.8.25/helpers/get.js', 'npm:babel-runtime@5.8.25/helpers/inherits.js', 'npm:babel-runtime@5.8.25/helpers/create-class.js', 'npm:babel-runtime@5.8.25/helpers/class-call-check.js', 'npm:babel-runtime@5.8.25/core-js/object/get-own-property-names.js', 'npm:babel-runtime@5.8.25/core-js/get-iterator.js', 'npm:babel-runtime@5.8.25/core-js/object/get-own-property-descriptor.js', 'npm:lodash@3.10.1.js', 'github:bizboard/arva-utils@1.0.0-beta-2/Context.js', 'github:bizboard/arva-utils@1.0.0-beta-2/ObjectHelper.js', 'src/core/PrioritisedObject.js', 'src/core/DataSource.js'], function (_export) {
    var _get, _inherits, _createClass, _classCallCheck, _Object$getOwnPropertyNames, _getIterator, _Object$getOwnPropertyDescriptor, _, Context, ObjectHelper, PrioritisedObject, DataSource, Model;

    return {
        setters: [function (_npmBabelRuntime5825HelpersGetJs) {
            _get = _npmBabelRuntime5825HelpersGetJs['default'];
        }, function (_npmBabelRuntime5825HelpersInheritsJs) {
            _inherits = _npmBabelRuntime5825HelpersInheritsJs['default'];
        }, function (_npmBabelRuntime5825HelpersCreateClassJs) {
            _createClass = _npmBabelRuntime5825HelpersCreateClassJs['default'];
        }, function (_npmBabelRuntime5825HelpersClassCallCheckJs) {
            _classCallCheck = _npmBabelRuntime5825HelpersClassCallCheckJs['default'];
        }, function (_npmBabelRuntime5825CoreJsObjectGetOwnPropertyNamesJs) {
            _Object$getOwnPropertyNames = _npmBabelRuntime5825CoreJsObjectGetOwnPropertyNamesJs['default'];
        }, function (_npmBabelRuntime5825CoreJsGetIteratorJs) {
            _getIterator = _npmBabelRuntime5825CoreJsGetIteratorJs['default'];
        }, function (_npmBabelRuntime5825CoreJsObjectGetOwnPropertyDescriptorJs) {
            _Object$getOwnPropertyDescriptor = _npmBabelRuntime5825CoreJsObjectGetOwnPropertyDescriptorJs['default'];
        }, function (_npmLodash3101Js) {
            _ = _npmLodash3101Js['default'];
        }, function (_githubBizboardArvaUtils100Beta2ContextJs) {
            Context = _githubBizboardArvaUtils100Beta2ContextJs.Context;
        }, function (_githubBizboardArvaUtils100Beta2ObjectHelperJs) {
            ObjectHelper = _githubBizboardArvaUtils100Beta2ObjectHelperJs.ObjectHelper;
        }, function (_srcCorePrioritisedObjectJs) {
            PrioritisedObject = _srcCorePrioritisedObjectJs.PrioritisedObject;
        }, function (_srcCoreDataSourceJs) {
            DataSource = _srcCoreDataSourceJs.DataSource;
        }],
        execute: function () {
            /**
             This Source Code is licensed under the MIT license. If a copy of the
             MIT-license was not distributed with this file, You can obtain one at:
             http://opensource.org/licenses/mit-license.html.
            
             @author: Tom Clement (tjclement)
             @license MIT
             @copyright Bizboard, 2015
            
             */

            'use strict';

            Model = (function (_PrioritisedObject) {
                _inherits(Model, _PrioritisedObject);

                /**
                 * Creates a new instance of a model.
                 * @param {String} id Optional: The identifier for this model. For a user model this might be a user ID, for example. It
                 *           is used to build the path to the dataSource. This path is <root>/<model name appended with 's'>/<id>.
                 *           If no id is given, a randomly generated one will be pushed to the dataSource. You can use this for
                 *           creating new objects in the dataSource.
                 * @param {Object} data Optional: The initial data to fill the model with. The model will be extended with any
                 *                      properties present in the data parameter.
                 * @param {Object} options Optional: Additional options. Currently used is "dataSnapshot", which if present is used
                 *                          to fetch the initial model data. If not present, the model will add a one-time
                 *                          subscription to the dataSource to fetch initial data.
                 * @returns {Model} Model Instance.
                 */

                function Model(id) {
                    var data = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];
                    var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

                    _classCallCheck(this, Model);

                    /* Retrieve dataSource from the DI context */
                    var dataSource = Context.getContext().get(DataSource);
                    _get(Object.getPrototypeOf(Model.prototype), 'constructor', this).call(this);

                    /* Replace all stub data fields of any subclass of Model with databinding accessors.
                     * This causes changes to be synched to and from the dataSource. */
                    this._replaceModelAccessorsWithDatabinding();

                    /* Calculate path to model in dataSource, used if no dataSource or path are given. */
                    var modelName = Object.getPrototypeOf(this).constructor.name;
                    var pathRoot = modelName + 's';

                    if (options.dataSource && id) {
                        this._dataSource = options.dataSource;
                    } else if (options.dataSource) {
                        /* No id is present, generate a random one by pushing a new entry to the dataSource. */
                        this._dataSource = options.dataSource.push(data);
                    } else if (options.path && id) {
                        this._dataSource = dataSource.child(options.path + '/' + id || '');
                    } else if (options.dataSnapshot) {
                        this._dataSource = dataSource.child(options.dataSnapshot.ref().path.toString());
                    } else if (id) {
                        /* If an id is present, use it to locate our model. */
                        this._dataSource = dataSource.child(pathRoot).child(id);
                    } else {
                        /* No id is present, generate a random one by pushing a new entry to the dataSource. */
                        if (options.path) {
                            this._dataSource = dataSource.child(options.path).push(data);
                        } else {
                            this._dataSource = dataSource.child(pathRoot).push(data);
                        }
                    }

                    /* Re-construct core PrioritisedObject with new dataSource */
                    if (options.dataSnapshot) {
                        this._buildFromSnapshot(options.dataSnapshot);
                    } else {
                        this._buildFromDataSource(this._dataSource);
                    }

                    /* Write local data to model, if any data is present. */
                    this._writeLocalDataToModel(data);
                }

                /**
                 * Replaces all getters/setters defined on the model implementation with properties that trigger update events to the dataSource.
                 * @returns {void}
                 * @private
                 */

                _createClass(Model, [{
                    key: '_replaceModelAccessorsWithDatabinding',
                    value: function _replaceModelAccessorsWithDatabinding() {
                        var _this = this;

                        var prototype = Object.getPrototypeOf(this);

                        while (prototype.constructor.name !== 'Model') {
                            /* Get all properties except the id and constructor of this model */
                            var propNames = _.difference(_Object$getOwnPropertyNames(prototype), ['constructor', 'id']);

                            var _iteratorNormalCompletion = true;
                            var _didIteratorError = false;
                            var _iteratorError = undefined;

                            try {
                                for (var _iterator = _getIterator(propNames), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                                    var _name = _step.value;

                                    var descriptor = _Object$getOwnPropertyDescriptor(prototype, _name);
                                    if (descriptor && descriptor.get) {
                                        var value = this[_name];
                                        delete this[_name];
                                        ObjectHelper.addPropertyToObject(this, _name, value, true, true, function () {
                                            _this._onSetterTriggered();
                                        });
                                    }
                                }
                            } catch (err) {
                                _didIteratorError = true;
                                _iteratorError = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion && _iterator['return']) {
                                        _iterator['return']();
                                    }
                                } finally {
                                    if (_didIteratorError) {
                                        throw _iteratorError;
                                    }
                                }
                            }

                            prototype = Object.getPrototypeOf(prototype);
                        }
                    }

                    /**
                     * Writes data, if present, to the Model's dataSource. Uses a transaction, meaning that only one update is triggered to the dataSource,
                     * even though multiple fields change.
                     * @param {Object} data Data to write, can be null.
                     * @returns {void}
                     * @private
                     */
                }, {
                    key: '_writeLocalDataToModel',
                    value: function _writeLocalDataToModel(data) {
                        if (data) {
                            var isDataDifferent = false;
                            for (var _name2 in data) {
                                if (_Object$getOwnPropertyDescriptor(this, _name2) && this[_name2] !== data[_name2]) {
                                    isDataDifferent = true;
                                    break;
                                }
                            }

                            if (isDataDifferent) {
                                this.transaction((function () {
                                    for (var _name3 in data) {

                                        // only map properties that exists on our model
                                        if (_Object$getOwnPropertyDescriptor(this, _name3)) {
                                            var value = data[_name3];
                                            this[_name3] = value;
                                        }
                                    }
                                }).bind(this));
                            }
                        }
                    }
                }]);

                return Model;
            })(PrioritisedObject);

            _export('Model', Model);
        }
    };
});
System.register('src/main.js', ['src/core/DataSource.js', 'src/core/Model.js', 'src/datasources/FirebaseDataSource.js', 'src/datasources/SharePointDataSource.js'], function (_export) {
  /**
   This Source Code is licensed under the MIT license. If a copy of the
   MIT-license was not distributed with this file, You can obtain one at:
   http://opensource.org/licenses/mit-license.html.
  
   @author: Hans van den Akker (mysim1)
   @license MIT
   @copyright Bizboard, 2015
  
   */

  'use strict';

  return {
    setters: [function (_srcCoreDataSourceJs) {
      var _exportObj = {};

      for (var _key in _srcCoreDataSourceJs) {
        if (_key !== 'default') _exportObj[_key] = _srcCoreDataSourceJs[_key];
      }

      _export(_exportObj);
    }, function (_srcCoreModelJs) {
      var _exportObj2 = {};

      for (var _key2 in _srcCoreModelJs) {
        if (_key2 !== 'default') _exportObj2[_key2] = _srcCoreModelJs[_key2];
      }

      _export(_exportObj2);
    }, function (_srcDatasourcesFirebaseDataSourceJs) {
      var _exportObj3 = {};

      for (var _key3 in _srcDatasourcesFirebaseDataSourceJs) {
        if (_key3 !== 'default') _exportObj3[_key3] = _srcDatasourcesFirebaseDataSourceJs[_key3];
      }

      _export(_exportObj3);
    }, function (_srcDatasourcesSharePointDataSourceJs) {
      var _exportObj4 = {};

      for (var _key4 in _srcDatasourcesSharePointDataSourceJs) {
        if (_key4 !== 'default') _exportObj4[_key4] = _srcDatasourcesSharePointDataSourceJs[_key4];
      }

      _export(_exportObj4);
    }],
    execute: function () {}
  };
});
})
(function(factory) {
  factory();
});
//# sourceMappingURL=arva-ds.js.map