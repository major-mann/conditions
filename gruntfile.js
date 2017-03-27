module.exports = function(grunt) {
    'use strict';

    // TODO: Need to add a babel step to go from ES6 to ES5 before uglify.

    grunt.initConfig({
        jshint: {
            src: ['src/**/*.js'],
            options: {
                jshintrc: true,
                globals: {
                    module: true,
                    require: true
                }
            }
        },
        jscs: {
            src: {
                src: 'src/**/*.js',
                options: {
                    config: '.jscsrc'
                }
            }
        },
        mochaTest: {
            spec: {
                options: {
                    reporter: 'spec',
                    quiet: false,
                    clearRequireCache: true
                },
                src: [
                    'spec/**/*.js',
                    'spec/**/*.spec.js'
                ]
            }
        },
        shell: {
            cover: 'istanbul --include-all-sources cover grunt test',
            options: {
                stdout: false,
                stderr: false,
                preferLocal: true
            }
        }
    });

    grunt.loadNpmTasks('grunt-mocha-test');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-jscs');
    grunt.loadNpmTasks('grunt-shell');

    // Create the tasks
    grunt.registerTask('check', ['jshint:src', 'jscs:src']);
    grunt.registerTask('test', ['mochaTest:spec']);
    grunt.registerTask('quality', ['check', 'test', 'cover']);
    grunt.registerTask('cover', ['shell:cover']);
    grunt.registerTask('default', ['test', 'build']);
};
