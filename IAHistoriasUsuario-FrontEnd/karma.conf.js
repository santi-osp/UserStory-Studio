// Karma configuration for CI quality gates (coverage + junit)
module.exports = function (config) {
    config.set({
        basePath: '',
        frameworks: ['jasmine', '@angular-devkit/build-angular'],
        plugins: [
            require('karma-jasmine'),
            require('karma-chrome-launcher'),
            require('karma-jasmine-html-reporter'),
            require('karma-coverage'),
            require('karma-junit-reporter'),
            require('@angular-devkit/build-angular/plugins/karma')
        ],
        client: {
            jasmine: {
            },
            clearContext: false
        },
        jasmineHtmlReporter: {
            suppressAll: true
        },
        reporters: ['progress', 'kjhtml', 'coverage', 'junit'],
        junitReporter: {
            outputDir: 'test-results',
            outputFile: 'junit.xml',
            useBrowserName: false
        },
        coverageReporter: {
            dir: require('path').join(__dirname, './coverage/front-angular'),
            subdir: '.',
            reporters: [
                { type: 'html' },
                { type: 'text-summary' },
                { type: 'cobertura' },
                { type: 'json-summary' }
            ],
            check: {
                global: {
                    statements: 70,
                    branches: 60,
                    functions: 70,
                    lines: 70
                }
            }
        },
        browsers: ['ChromeHeadless'],
        restartOnFileChange: true
    });
};
