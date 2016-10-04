module.exports = function(grunt) {
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
        browserify: {
            main: {
                files: {
                    'dist/conditions.js': ['src/index.js']
                }
            }
        },
        uglify: {
            options: {
                mangle: true
            },
            dist: {
                files: {
                    'dist/conditions.min.js': ['dist/conditions.js']
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-browserify');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-jscs');

    // Create the tasks
    grunt.registerTask('build', ['browserify:main', 'uglify:dist']);
    grunt.registerTask('test', ['jshint:src', 'jscs:src']);
    grunt.registerTask('default', ['test', 'build']);
};
