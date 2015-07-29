module.exports = function(grunt) {
    grunt.initConfig({
        jshint: {
            src: ['src/**/*.js'],
            options: {
                globals: {
                    module: true,
                    require: true
                }
            }
        },
        shell: {
            escodegen: {
                command: 'node node_modules/commonjs-everywhere/bin/cjsify -a path: build/escodegen.entry.js > build/escodegen.js'
            }
        },
        concat: {
            options: {
                seperator: ';\n'
            },
            dist: {
                src: [
                    'build/build.wrap.start.js',
                    'node_modules/esprima/esprima.js',
                    'build/build.wrap.mid.js',
                    'build/escodegen.js',
                    'build/build.wrap.mid2.js',
                    'src/parser.js',
                    'build/build.wrap.end.js'
                ],
                dest: 'dist/configurator.js'
            }
        },
        uglify: {
            options: {
                mangle: true
            },
            dist: {
                files: {
                    'dist/configurator.min.js': ['dist/configurator.js']
                }
            }

        }
    });

    grunt.loadNpmTasks('grunt-shell');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-jshint');

    //Create the tasks
    grunt.registerTask('build', ['shell:escodegen', 'concat:dist']);
    grunt.registerTask('default', ['jshint:src', 'build']);
};