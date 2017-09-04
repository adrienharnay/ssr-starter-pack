# Server Side Rendering Starter Pack

At my daily job at [brigad.co](https://brigad.co), we have been using React, React-router and Webpack for quite some time. When the need to have better SEO and to deliver content faster arose, the choice to integrate Server Side Rendering came as obvious. So I started playing around with the most popular frameworks. To name two:

- [Gatsby](https://www.gatsbyjs.org/)
- [Next](https://learnnextjs.com/)

Now, if you are starting a new project, or have a medium-sized one, or even are eager to do some refactoring on your project architecture and configuration, I would definitely recommend you try the two frameworks and pick the one you most like. Just like most people would use [create-react-app](https://github.com/facebookincubator/create-react-app) to start a client-side project, they are great for starting something quickly. Plus both these project have an awesome community behing them, and arguably more features than this _starter_ pack offers.  
However, after we've tried the two, we felt like the restrictions would led to too much refactoring, and decided to try implementing our own solution, using (almost) only Webpack.  

## What is Server Side Rendering?

First, let's start with what is Client Side Rendering: your srver sends your client an HTML page, with an empty body and a script tag which will load your React bundle. The client's browser will parse the React code, build the DOM and inject it in the HTML.  
_Based on their network and CPU, the client could wait ages to see meaningful content_


With Server Side Rendering, your bundle is first converted to HTML on the server, and the actual content is sent to the client. Then, the client's browser will do the same job as before, and check that the output from your bundle is the same as the DOM the server just sent.  
_The client sees the content instantly, instead of having to wait for the Javascript to be parsed_

## Requirements

So, let's start with the requirements, based on the needs of our project:

- [Code splitting / Route-based chunk loading on the client](#code-splitting--route-based-chunk-loading-on-the-client)
- [CSS Modules working without FOUT]()
- [Smaller images bundled with JS, larger images served by S3]()
- [Long-term caching of assets, including chunks]()
- [A proper dev environment]()
- [A painless experience for the developer]()

### Code splitting / Route-based chunk loading on the client
