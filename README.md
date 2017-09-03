# Server Side Rendering Starter Pack

At my daily job at [brigad.co](https://brigad.co), we have been using React, React-router and Webpack for quite some time. When the need to have better SEO and to deliver content faster arose, the choice to integrate Server Side Rendering came as obvious. So I started playing around with the most popular frameworks. To name two:

- [Gatsby](https://www.gatsbyjs.org/)
- [Next](https://learnnextjs.com/)

Now, if you are starting a new project, or have a medium-sized one, or even are eager to do some refactoring on your project architecture and configuration, I would definitely recommend you try the two frameworks and pick the one you most like. Just like most people would use [create-react-app](https://github.com/facebookincubator/create-react-app) to start a client-side project.  
However, after we've tried the two, we felt like the restrictions would led to too much refactoring, and decided to try implementing our own solution, using (almost) only Webpack.  

## Requirements

So, let's start with the requirements, based on the needs of our project:

- [Code splitting / Route-based chunk loading on the client]()
- [CSS Modules working without FOUT]()
- [Smaller images bundled with JS, larger images served by S3]()
- [Long-term caching of assets, including chunks]()
- [A proper dev environment]()
- [A painless experience for the developer]()

### Code splitting / Route-based chunk loading on the client
