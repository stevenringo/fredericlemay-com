const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');
const purgecss = require('@fullhuman/postcss-purgecss');

module.exports = {
    plugins: [
        tailwindcss('./tailwind.js'),
        purgecss({
            content: ['layouts/**/*.html'],
            css: ['assets/css/main.css'],
            extractors: [{
                extractor: class {
                    static extract(content) {
                        return content.match(/[A-z0-9-:\/]+/g) || [];
                    }
                },
                extensions: ['html']
            }]
        }),
        autoprefixer({
            browsers: [
                "Android 2.3",
                "Android >= 4",
                "Chrome >= 20",
                "Firefox >= 24",
                "Explorer >= 8",
                "iOS >= 6",
                "Opera >= 12",
                "Safari >= 6"
            ]
        })
    ]
}