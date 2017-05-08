# Conditions
Conditions aims to be a fully fledged configuration manager for javascript. It's aim is to make configuration
flexible enough to be used in multiple situations, but allow data to be defined in a single place and referenced
throughout the configuration. This allows a high level of flexibility. In addition there are configuration options
which make it easy to work with multiple configurations for different environments. The loading system simply skips
files which do not exist, so all levels can be specified, and only the available files will be used to prepare the
configuration. See the `example/` directory to see some simple examples of what is possible.

## Quick start
A convenience loader is supplied which allows `FS` and `HTTP` loading. FS loading is assumed by default, and the
current loader can be specified by specifying the appropriate protocol in the URI.

`npm install conditions`

`conditions('config/app.config', 'http://www.example.com/config/app', options)`

The above command will result in the following (Note: Some parts may be in parallel):
    1. Load `./config/app.config`
    2. Load `http://www.example.com/config/app.config`
    3. Override `1` with `2` and return the result

## Options
The following options are available when calling the parser:

* **protectStructure** - When set to true, all property definitions in the configuration will be set
    to non-configurable.
* **readOnly** - When set to true, all value properties in the configuration will be set to
    non-writable.
* **levels** - An array used to explode filenames to load. Every file specified in the main loader function will
    become n files (where n is the number of levels defined) and a sub extension will be added to each of the
    filenames. If an empty string is passed, an entry with no sub extension will be generated.
* **verbose** - When set to true, will print out full errors in the case of load files not found.

## Notes on the load paths
By default the initial default path is a `file://` path pointing to the current working directory of the process.

If an absolute path is received, it will override this relative path. If a `URL` is supplied the domain will become
part of the base and a `file://` URI should be used to clear the HTTP part from the base if desired (and set a new base since we always expect an absolute location.) Some examples below.

To load a file named `production` in the `config` directory found in the current working directory (`process.cwd()`),
then extend it with `development` and `local`, which are also found in the `config` directory.
* `conditions('/config/production', 'development', 'local')`

To load a file from `http://example.com/config/production`, extend it with a file from
`http://example.com/config/production`, extend it with a file `local1` from the `config` directory,
then with a file `local2`, also from the `config` directory.

`conditions('http://example.com/config/production', 'development', 'file:///config/local1', 'local2')`

## Config objects
Loaded files are parsed and processed, becoming specialized config objects. These objects have some idiosyncrasies which
a developer should be aware of.

When assigning an object to a config object, a copy of that object (which itself is a config object) will end up
being assigned to the object. i.e. `var bar = {}; configObj.foo = bar; configObj.foo === bar; // false`



## Configuration file format

    {
        "string property": "foo bar",
        num: 100,
        bool: true,
        // Comments inside of the config are also possible
        regexp: /yeah/,
        subobjects: {
            "sure": ['and', 'arrays','too','(', 'You can also define an array as the root', ')']
        },
        expression: this['string property'] + num
    }

Wrapping `{}` and `[]` are optional. An array or object will be inferred from the contents.

### Supported value types
Strings, numbers, booleans and regular expressions are supported. You can define sub objects, and
also arrays. You can also define expressions which can access values in the current object directly
by name, or through the "this" value (mainly for properties whose name is not definable directly.
For example, a property named "foo bar" cannot be referenced directly through valid script,
so this["foo bar"] is made available for this purpose).

Expressions are also able to reference other objects in the configuration hierarchy by referencing
the desired objects through their id value (described below). When an expression is part of an
extending configuration the `base` identifier can be used to access the underlying value, the
`source` identifier can be used to access the underlying config at its root, and any objects
declared with id properties will be available to the extending config expressions.

### id property
The special id property can be used as follows to provide cross object references. The id property
is only considered as a reference id if the name is provided without quotes. If the name has quotes,
the id property is considered to be a part of the configuration.
An id identifier is not stored directly on the resulting configuration object, but rather on the
`prototype` so that if an id config value is defined it will still be available on the config
object.

    {
        id: root,
        id: "Configuration property",
        val: 10,
        sub: {
            id: sub,
            subval: 10
        },
        sub2: {
            val: root.val + sub.val
        }
    }

An inspection of the values on this object should produce something like:

    {
        id: "Configuration property",
        val: 10,
        sub: {
            subval: 10
        },
        sub2: {
            val: 20
        }
    }

with a prototype of:

    {
        id: "root",
        ...
    }

Note: As you change `sub.subval`, subsequent calls to `sub2.val` will result in different values.

### Real world example
Consider the following example of server configuration. If we were using plain JSON, we would have to update multiple values (server.url, site.home and site.api) when changing, for example, the port.

    server: {
        id: server,
        port: 8080,
        host: 'example.com',
        secure: false,
        protocol: secure ? 'https' : 'http',
        url: `${protocol}://${host}:${port === 80 ? '' : port}/`
    },

    site: {
        home: server.url + 'index.html',
        api: `${server.url}api/`
    }

## Watching for changes
If you wish to watch for changes on a config object, you can use
`conditions.on(<config object>, <event name>, <event handler>)`. `on` is a shortcut for `addListener`,
and `removeListener` is available to remove handlers from events. Any config object receives changes for the child
objects associated with it. These are prefixed with "`<property name>.`"

## Array commands
When extending an array commands may be used for manipulation of the array. Commands will only be
applied if every item in the array is a valid command (By default, an object containing exactly
one property named `$`.).

For commands where it is appropriate, the `find` property is used for searching, and behaves as
follows: It will match if it matches the array value explicitly or, if it is an object and the
array value is an object, if every property matches every property of the same name on the
array element.

The following commands may be issues:
* **add** - Adds the value defined in the property `value` to the end of the array.
* **remove** - Removes a value from the array. The `find` (See above) property is used to
    determine which element to remove.
* **update** - Replaces an element in the array. The `find` (See above) property is used to
    determine which element to replace.
* **extend** - Runs the standard extend procedure on an element in the array. The `find`
    (See above) property is used to determine which element to replace.
* **clear** - Removed all items from the array.

# Features for V2
These are the feature planned for version 2.

* Resource saver
* Rebuild of internals (In order to better facilitate resource saving, and move fully to an ES6 Proxy model)

# Roadmap to V1.0.0

* Work
    * resource-loader mock (should be available directly through index.js)
    * Ensure config file and locations are reported correctly on syntax errors.
    * documentation
* Systems
    * travis CI
    * codecov.io
