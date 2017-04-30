/**
 * @module Utilities. This module is for small pieces of code which are used around the library, but are not really
 *  big enopugh to be housed alone.
 */
'use strict';

module.exports = {
    explodeLevels
};

const url = require('url'),
    path = require('path');

/** Uses the defined levels to create a new locations array with all the levels being loaded */
function explodeLevels(locations, levels) {
    locations = locations.map(processLocation);
    if (locations.length) {
        locations = Array.prototype.concat.apply(locations[0], locations.slice(1));
    }
    return locations;

    /** Extracts the path name, processes and reconstructs the URI */
    function processLocation(uri) {
        // We only want to process string locations
        if (typeof uri !== 'string') {
            return [uri];
        }

        uri = url.parse(uri);
        const paths = processLevel(uri.pathname);
        return paths.map(function processPath(p) {
            const uriObj = Object.assign({}, uri, { pathname: p });
            return url.format(uriObj);
        });
    }

    /** Generates an array of values for the given filename  */
    function processLevel(value) {
        var ext;
        const uri = url.parse(value);
        const directory = path.dirname(uri.pathname);
        ext = path.extname(uri.pathname);
        if (levels.includes(ext.substr(1))) {
            const subExt = path.extname(path.basename(uri.pathname), ext);
            if (subExt && !levels.includes(subExt.substr(1))) {
                ext = '';
            }
        }
        const fileName = path.basename(uri.pathname, ext);

        return levels.map(function processLevel(level) {
            var newFileName;
            if (level) {
                newFileName = path.join(directory, `${fileName}.${level}${ext}`);
            } else {
                newFileName = path.join(directory, `${fileName}${ext}`);
            }
            uri.pathname = newFileName;
            return url.format(uri);
        });
    }
}
