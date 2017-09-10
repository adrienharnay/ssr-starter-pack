# You might (not) need a SSR framework

> TL;DR: a repository is all set up for you right [here](https://github.com/Zephir77167/ssr-starter-pack)

At my daily job at [brigad.co](https://brigad.co), we have been using React, React-router and Webpack for quite some time. When the need to have better SEO and to deliver content faster arose, the choice to integrate Server Side Rendering came as obvious. So I started playing around with the most popular frameworks. To name two:

- [Gatsby](https://www.gatsbyjs.org/)
- [Next](https://learnnextjs.com/)

Now, if you are starting a new project, or have a medium-sized one, or even are eager to do some refactoring on your project architecture and configuration, I would definitely recommend you try the two frameworks and pick the one you most like. Just like most people would use [create-react-app](https://github.com/facebookincubator/create-react-app) to start a client-side project, they are great for starting something quickly. Plus both these project have an awesome community behing them, and arguably more features than this _starter_ pack offers.  
However, after we've tried the two, we felt like the restrictions would led to too much refactoring, and decided to try implementing our own solution, using (almost) only Webpack.  

## What is Server Side Rendering?

First, let's start with what is Client Side Rendering: your srver sends your client an HTML page, with an empty body and a script tag which will load your React bundle. The client's browser will parse the React code, build the DOM and inject it in the HTML.  
_Based on their network and CPU, the client could wait ages to see meaningful content._


With Server Side Rendering, your bundle is first converted to HTML on the server, and the actual content is sent to the client. Then, the client's browser will do the same job as before, and check that the output from your bundle is the same as the DOM the server just sent.  
_The client sees the content instantly, instead of having to wait for the Javascript to be parsed._

## Requirements

So, let's start with the requirements, based on the needs of our project:

- [Code splitting / Route-based chunk loading on the client](#code-splitting--async-chunk-loading-on-the-client)
- [CSS Modules working without FOUT](#css-modules-working-without-fout)
- [Smaller images bundled with JS, larger images served by S3 (or some other CDN)](#smaller-images-bundled-with-js-larger-images-served-by-s3-or-some-other-cdn)
- [Long-term caching of assets, including chunks](#long-term-caching-of-assets-including-chunks)
- [A proper development environment](#a-proper-development-environment)
- [A painless experience for the developer]()

### Code splitting / Async chunk loading on the client

_I wan to start by giving credit to [this post](https://blog.emilecantin.com/web/react/javascript/2017/05/16/ssr-react-router-4-webpack-code-split.html) by Emile Cantin, which helped me a lot on the subject._

Let's start with the most complicated part.

#### What do we want here?

On the client, we want code splitting with async chunk loading, so that the client only downloads chunks which are essentials for the current view. On the server, we want only one bundle, but while rendering we will store the chunks that would have been loaded on the client.

This is done with these two HOCs:

[asyncComponent.js](./client/src/hoc/code-splitting/js/asyncComponent.js)
```js
const asyncComponent = (getComponent) => {
  class AsyncComponent extends React.Component {
    static preloadedComponent = null;

    static loadComponent = async () => {
      const module = await getComponent();
      const Component = module.default;

      AsyncComponent.preloadedComponent = Component;

      return Component;
    };

    constructor(props) {
      super(props);

      this.state = {
        Component: AsyncComponent.preloadedComponent,
      };

      this.mounted = false;
    }

    async componentWillMount() {
      if (!this.state.Component) {
        const Component = await AsyncComponent.loadComponent();

        if (this.mounted) {
          this.setState({ Component });
        }
      }
    }

    componentDidMount() {
      this.mounted = true;
    }

    componentWillUnmount() {
      this.mounted = false;
    }

    render() {
      const { Component } = this.state;

      if (!Component) {
        return null;
      }

      return (
        <Component {...this.props} />
      );
    }
  }

  return AsyncComponent;
};
```

This one is the client version. It asynchronously loads a component and renders it when it is ready.

[syncComponent.js](./client/src/hoc/code-splitting/js/syncComponent.js)

```js
const syncComponent = (chunkName, mod) => {
  const Component = mod.default ? mod.default : mod;

  const SyncComponent = ({ staticContext, ...otherProps }) => {
    if (staticContext.splitPoints) {
      staticContext.splitPoints.push(chunkName);
    }

    return (
      <Component {...otherProps} />
    );
  };

  SyncComponent.propTypes = {
    staticContext: PropTypes.object,
  };

  SyncComponent.defaultProps = {
    staticContext: undefined,
  };

  return SyncComponent;
};
```

And here is the server version. It renders a synchronous component, and pushes its name to an array we pass it as a parameter. This parameter is [implicitly passed as staticContext](https://reacttraining.com/react-router/web/guides/server-rendering) by react-router to routes.

#### How do we use those?

The goal is to have a file (well two) with every route declared in it. One for the client version, and one for the server version.

[AsyncBundles.js](./client/src/entry/js/components/AsyncBundles.js)

```js
export const MainLayout = asyncComponent(() => import(/* webpackChunkName: "MainLayout" */'src/views/main-layout/js/MainLayout'));
export const Home = asyncComponent(() => import(/* webpackChunkName: "Home" */'src/views/home/js/Home'));
export const Page1 = asyncComponent(() => import(/* webpackChunkName: "Page1" */'src/views/page1/js/Page1'));
export const Page2 = asyncComponent(() => import(/* webpackChunkName: "Page2" */'src/views/page2/js/Page2'));
```

A bit tedious to repeat the name of the importer component in the [Webpack magic comment](https://webpack.js.org/guides/code-splitting/#dynamic-imports), but it is on the same line so not a big problem.

[Bundles.js](./client/src/entry/js/components/Bundles.js)
```js
export const MainLayout = syncComponent('MainLayout', require('src/views/main-layout/js/MainLayout'));
export const Home = syncComponent('Home', require('src/views/home/js/Home'));
export const Page1 = syncComponent('Page1', require('src/views/page1/js/Page1'));
export const Page2 = syncComponent('Page2', require('src/views/page2/js/Page2'));
```

Same problem with the server version, but again, not the worst.

#### What do we do with our routes?

Good question. Now that our routes are gathered ine one file, it is time to define the structure of our app, thanks to [react-router-config](https://github.com/ReactTraining/react-router/tree/master/packages/react-router-config).

[routes.js](./client/src/entry/js/components/routes.js)
```js
import { MainLayout, Home, Page1, Page2 } from './Bundles';

const RedirectToNotFound = () => <Redirect to="/" />;

const routes = (
  <Route component={MainLayout}>

    <Route exact path="/page1" component={Page1} />
    <Route exact path="/page2" component={Page2} />
    <Route exact path="/" component={Home} />

    <Route component={RedirectToNotFound} />
  </Route>
);

const getChildRoutes = childRoutes => React.Children.map(childRoutes, ({ props: { exact, path, component, children } }) => ({
  exact,
  path,
  component,
  routes: children ? getChildRoutes(children) : children,
}));

const routesArray = [{
  exact: routes.props.exact,
  path: routes.props.path,
  component: routes.props.component,
  routes: getChildRoutes(routes.props.children),
}];
```

With this awesome package, and the `getChildRoutes` function, you can define your routes in a declarative way, in one file (which is practical for the server to know which routes can be rendered). The catch is, when you nest routes, your parent route must have this code inside it to render its children:

[MainLayout.js](./client/src/views/main-layout/js/MainLayout.js)
```js
import { renderRoutes } from 'react-router-config';

const MainLayout = ({ route: { routes } }) => (
  <div>
    {renderRoutes(routes)}
  </div>
);
```

#### How do we differentiate between the client and server versions?

With a simple use of `webpack.NormalModuleReplacementPlugin`! Client side, it will replace occurences of `Bundle` with `AsyncBundle`.

[webpack.config.client.js](./webpack.config.client.js)
```js
new webpack.NormalModuleReplacementPlugin(/\/components\/Bundles/, './components/AsyncBundles'),
new webpack.NormalModuleReplacementPlugin(/\/Bundles/, './AsyncBundles'),
```

#### Make the whole thing work

To wrap all of this, we create two entry points.

[server.js](./client/src/entry/js/server.js)
```js
const render = manifests => (req, res) => {
  initializeServerSideHeaders(req.headers);

  const context = {
    splitPoints: [],
  };

  const markup = renderToString(
    <App type="server" url={req.url} context={context} />,
  );

  if (context.url) {
    return res.redirect(301, context.url);
  }

  const helmet = Helmet.renderStatic();

  const LoadingBarStyle = !isMobileBrowser() ? getPaceLoadingBarStyle() : '';
  const LoadingBarScript = !isMobileBrowser() ? getPaceLoadingBarScript() : '';

  const SplitPointsScript = `
    <script>
      window.splitPoints = ${JSON.stringify(context.splitPoints)};
      window.serverSideHeaders = ${JSON.stringify(req.headers)};
    </script>
  `;
  const ChunkManifestScript = manifests.client ? `
    <script src="${manifests.client['manifest.js']}"></script>
  ` : '';

  return res.send(`
    <!doctype html>
    <html>
      <head>
        ${helmet.title.toString()}
        ${helmet.meta.toString()}
        ${helmet.link.toString()}
        ${helmet.script.toString()}
        ${helmet.noscript.toString()}
        
        <link rel="stylesheet" href="${!manifests.server ? '/dist/server/main.css' : manifests.server['main.css']}" />
        ${LoadingBarStyle}
      </head>
      <body>
        <div id="content">${markup}</div>
        
        ${LoadingBarScript}
        ${SplitPointsScript}
        ${ChunkManifestScript}
        <script src="${!manifests.client ? '/dist/client/vendors.js' : manifests.client['vendors.js']}"></script>
        <script src="${!manifests.client ? '/dist/client/main.js' : manifests.client['main.js']}"></script>
      </body>
    </html>
  `);
};
```

This one will generate the markup on the server and send it to the client. Note that if a redirection happens between the rendering of the App, it will immediately redirect the client, making it seamless. I also added [pace.js](http://github.hubspot.com/pace/docs/welcome/) to indicate to the user the site isn't responsive yet, but this is a matter of preference.  
Also note that we inject the `splitPoints` and `serverSideHeaders` in the window, for the client to use.

[App.js](./client/src/entry/js/App.js)
```js
const App = ({ type, url, context }) => {
  const Routing = type === 'client' ? (
    <ClientRouting />
  ) : (
    <ServerRouting url={url} context={context} />
  );

  return (
    <div>
      <Head />
      {Routing}
    </div>
  );
};
```

This component will just render the right router (browser or static) based on the type of the App, and the head for meta tags.

[client.js](./client/src/entry/js/client.js)
```js
import * as Bundles from './components/Bundles';
import App from './App';

const doRender = () => {
  render(
    <AppContainer>
      <App type="client" />
    </AppContainer>,
    document.getElementById('content'),
  );
};

const serverSideHeaders = window.serverSideHeaders || {};
initializeServerSideHeaders(serverSideHeaders);

const splitPoints = window.splitPoints || [];
Promise.all(splitPoints.map(chunk => Bundles[chunk].loadComponent()))
  .then(doRender);
```

And finally, the client entry point. It receives the split points and waits for all of them to be loaded to render. We also store the server side headers because it is often useful to have access to headers we otherwise couldn't access from the client (e.g. Accept-Language or custom headers).


All of this code makes everything possible, but what about CSS? Our Node server sure doesn't know how to interpret it, and style-loader won't be of any help here as it relies on `window` to work.

### CSS Modules working without FOUT

The solution here is rather simple. We want to use [extract-text-webpack-plugin](https://github.com/webpack-contrib/extract-text-webpack-plugin) on the server to bundle our CSS in a separate file, which will get included in the HTML we send to our users.  
While we're at it, we should use [autoprefixer](https://github.com/postcss/autoprefixer) with a [.browserslistrc](https://github.com/ai/browserslist) to specify which browsers we want to support!

[webpack.config.server.js](./webpack.config.server.js)
```js
const ExtractTextPlugin = require('extract-text-webpack-plugin');

const extractCSS = new ExtractTextPlugin({
  filename: !IS_PRODUCTION ? 'server/[name].css' : 'server/[name].[contenthash:8].css',
  ignoreOrder: true,
});

const getCommonCSSLoaders = () => [
  {
    loader: 'css-loader',
    options: {
      modules: true,
      importLoaders: 1,
      localIdentName: !IS_PRODUCTION ? '[name]_[local]_[hash:base64:3]' : '[local]_[hash:base64:3]',
      minimize: stripUselessLoaderOptions(IS_PRODUCTION),
    },
  },
  {
    loader: 'postcss-loader',
    options: {
      sourceMap: stripUselessLoaderOptions(!IS_PRODUCTION),
      ident: 'postcss',
      plugins: () => [
        require('postcss-flexbugs-fixes'),
        autoprefixer({
          env: NODE_ENV,
          flexbox: 'no-2009',
        }),
      ],
    },
  },
];

const rules = [
  {
    test: /\.css$/,
    loader: extractCSS.extract({
      fallback: 'style-loader',
      use: [
        ...getCommonCSSLoaders(),
      ],
    }),
  },
  {
    test: /\.scss$/,
    loader: extractCSS.extract({
      fallback: 'style-loader',
      use: [
        ...getCommonCSSLoaders(),
        ...(!IS_PRODUCTION ? [{
          loader: 'resolve-url-loader',
        }] : []),
        {
          loader: 'sass-loader',
          options: !IS_PRODUCTION ? {
            sourceMap: true,
          } : undefined,
        },
      ],
    }),
  },
];

const plugins = [
  extractCSS,
];
```

In the client config:

[webpack.config.client.js](./webpack.config.client.js)
```js
const ExtractTextPlugin = require('extract-text-webpack-plugin');

const extractCSS = new ExtractTextPlugin({
  filename: !IS_PRODUCTION ? 'server/[name].css' : 'server/[name].[contenthash:8].css',
  ignoreOrder: true,
});

const getCommonCSSLoaders = () => [
  {
    loader: 'style-loader',
  },
  {
    loader: 'css-loader',
    options: {
      modules: true,
      importLoaders: 1,
      localIdentName: !IS_PRODUCTION ? '[name]_[local]_[hash:base64:3]' : '[local]_[hash:base64:3]',
      minimize: stripUselessLoaderOptions(IS_PRODUCTION),
    },
  },
  {
    loader: 'postcss-loader',
    options: {
      sourceMap: stripUselessLoaderOptions(!IS_PRODUCTION),
      ident: 'postcss',
      plugins: () => [
        require('postcss-flexbugs-fixes'),
        autoprefixer({
          env: NODE_ENV,
          flexbox: 'no-2009',
        }),
      ],
    },
  },
];

const rules = [
  {
    test: /\.css$/,
    use: [
      ...getCommonCSSLoaders(),
    ],
  },
  {
    test: /\.scss$/,
    use: [
      ...getCommonCSSLoaders(),
      ...(!IS_PRODUCTION ? [{
        loader: 'resolve-url-loader',
      }] : []),
      {
        loader: 'sass-loader',
        options: !IS_PRODUCTION ? {
          sourceMap: true,
        } : undefined,
      },
    ],
  },
];
```

And in the markup we send to the client:

[server.js](./client/src/entry/js/server.js)
```js
<link rel="stylesheet" href="${!manifests.server ? '/dist/server/main.css' : manifests.server['main.css']}" />
```

I haven't talk about those weird "manifests" for now, this will come later in the long-term cache section. Don't worry about it for now.


And that's it, CSS is handled! But what about images?

### Smaller images bundled with JS, larger images served by S3 (or some other CDN)

First, we will define a breakpoint between small and large images. Let's say 20kb for the sake of this article. Thanks to [url-loader](https://github.com/webpack-contrib/url-loader), images which weigh less than 20kb after compression will be inlined, while larger images will be loaded by the browser.

#### Generating images

[webpack.config.client.js](./webpack.config.client.js)
```js
const rules = [
  {
    test: /.*\.(eot|woff|woff2|ttf|svg|png|jpe?g|gif)$/i,
    use: [
      {
        loader: 'url-loader',
        options: {
          name: 'images/[name].[hash].[ext]',
          limit: 20000,
        },
      },
      {
        loader: 'image-webpack-loader',
        options: {
          bypassOnDebug: true,
          mozjpeg: {
            quality: 85,
          },
          pngquant: {
            quality: '80-90',
            speed: 1,
          },
        },
      },
    ],
  },
];
```

_Did you say compression?_

Yes! While we're at it, why not using [image-webpack-loader](https://github.com/tcoopman/image-webpack-loader) which provides a way to compress images at build time, so we can ensure our users only download the most optimized content?

_Tip: for this rule, use the same config on the server than on the client, except for `emitFile: false` on the server_

And voila! Images are generated by the client build, and ignored by the server build (because the output would be the same).

#### Storing them on a CDN

Now, how do we store our images on a CDN and access them?

For the storing part, just put your images on a S3 bucket or some other CDN.

[webpack.config.client.js](./webpack.config.client.js)
```js
const PUBLIC_PATH = !IS_PRODUCTION || IS_LOCAL ? '/dist/' : process.env.ASSETS_URL;
```

As for accessing them, provide ASSETS_URL to the `build` script in [package.json](./package.json), and it will replace `dist` with the proper URL!

_Tip: you can always use `build:local` to debug your app in a production environment, but accessing your assets from your local storage_

### Long-term caching of assets, including chunks

Our project works as intended! But what about cache? What is the point of providing a blazing-fast website when the user has to download every asset every time he visits it?

If you're not familiar with the notion of long-term caching, I suggest you read the [docs from Webpack](https://webpack.js.org/guides/caching/). Basically, it makes so that your assets are cached indefinitely, unless they are changed. Note that this only effects production build, as don't want any cache in development.

#### Bundling node modules in a vendors chunk

Node modules are heavy, and change less often than product code. Wouldn't it be a shame if the client should download node modules all over again each time a new feature is deployed? _It would_. But it's not, because we will bundle our node modules code in a separate chunk, which will only be invalidated when you update your dependencies.

Also, code which is common to multiple chunks could be exported to a separate chunk to it only gets downloaded once.

[webpack.config.client.js](./webpack.config.client.js)
```js
const plugins = [
  new webpack.optimize.CommonsChunkPlugin({
    name: 'client',
    async: 'common',
    children: true,
    minChunks: (module, count) => {
      if (module.resource && (/^.*\.(css|scss)$/).test(module.resource)) {
        return false;
      }
      return count >= 3 && module.context && !module.context.includes('node_modules');
    },
  }),
  new webpack.optimize.CommonsChunkPlugin({
    name: 'client',
    children: true,
    minChunks: module => module.context && module.context.includes('node_modules'),
  }),
  new webpack.optimize.CommonsChunkPlugin({
    name: 'vendors',
    minChunks: module => module.context && module.context.includes('node_modules'),
  }),
];
```

Now, modules imported in 3 chunks or more will go in the `common` chunk, and node modules will go in the `vendors` chunk.

#### Generating hashes in our assets names

For every asset, we will want to have a hash based on the content of the chunk, so that if even one byte changed, the hash would too. We will achieve this by specifying a content hash in our assets names, in the webpack configs.

[webpack.config.client.js](./webpack.config.client.js)
```js
{
  loader: 'url-loader',
  options: {
    name: 'images/[name].[hash].[ext]',  
  },
},
...
output: {
  filename: !IS_PRODUCTION ? 'client/[name].js' : 'client/[name].[chunkhash].js',
  chunkFilename: !IS_PRODUCTION ? 'client/chunks/[name].chunk.js' : 'client/chunks/[name].[chunkhash].chunk.js',
},
```

[webpack.config.server.js](./webpack.config.server.js)
```js
const extractCSS = new ExtractTextPlugin({
  filename: !IS_PRODUCTION ? 'server/[name].css' : 'server/[name].[contenthash:8].css',
});
...
{
  loader: 'url-loader',
  options: {
    name: 'images/[name].[hash].[ext]',
  },
},
```

Also, we will use [md5-hash-webpack-plugin]() for more consistent hashes.

[webpack.config.client.js](./webpack.config.client.js)
```js
const Md5HashPlugin = require('md5-hash-webpack-plugin');

const prodPlugins = [
  new Md5HashPlugin(),
];
```

#### Mapping hashed names to predictable names

To include our assets in the document, we will need to be able to predict their dynamic name. For this one, we will be using [webpack-manifest-plugin]().

[webpack.config.client.js](./webpack.config.client.js)
```js
const ManifestPlugin = require('webpack-manifest-plugin');

const prodPlugins = [
  new ManifestPlugin({
    fileName: 'client-manifest.json',
    publicPath: PUBLIC_PATH,
  }),
];
```

[webpack.config.server.js](./webpack.config.server.js)
```js
const ManifestPlugin = require('webpack-manifest-plugin');

const prodPlugins = [
  new ManifestPlugin({
    fileName: 'server-manifest.json',
    publicPath: PUBLIC_PATH,
  }),
];
```

#### Including assets in the document

The last step is to include our assets in the document. It requires accessing our manifests, in order to include the right assets names.

[app.js](./app.js)
```js
const manifests = {};
manifests.server = require('./public/dist/server-manifest');
manifests.client = require('./public/dist/client-manifest');

app.use(serverRender(manifests));
```

[server.js](./client/src/entry/js/server.js)
```js
const render = manifests => (req, res) => {
  const markup = renderToString(
    <App type="server" url={req.url} context={context} />,
  );
  
  return res.send(`
    <!doctype html>
    <html>
      <head>
        <link rel="stylesheet" href="${!manifests.server ? '/dist/server/main.css' : manifests.server['main.css']}" />
      </head>
      <body>
        <div id="content">${markup}</div>
          
        <script src="${!manifests.client ? '/dist/client/vendors.js' : manifests.client['vendors.js']}"></script>
        <script src="${!manifests.client ? '/dist/client/main.js' : manifests.client['main.js']}"></script>
      </body>
    </html>
  `);
};
```

And this is it! Your user will now only download changed content, and keep the rest in cache.

### A proper development environment

I talked a lot about the production setup, but what about development? It is quite similar to production, except we add hot reloading on the server and client, meaning we don't have to rebuild between changes as Webpack is watching our files!

[app.dev.js](./app.dev.js)
```js
const webpack = require('webpack');
const webpackDevMiddleware = require('webpack-dev-middleware');
const webpackHotMiddleware = require('webpack-hot-middleware');
const webpackHotServerMiddleware = require('webpack-hot-server-middleware');
const clientConfig = require('./webpack.config.client');
const serverConfig = require('./webpack.config.server');

const multiCompiler = webpack([clientConfig, serverConfig]);
const clientCompiler = multiCompiler.compilers[0];

app.use(webpackDevMiddleware(multiCompiler, {
  publicPath: clientConfig.output.publicPath,
  noInfo: true,
  stats: { children: false },
}));
app.use(webpackHotMiddleware(clientCompiler));
app.use(webpackHotServerMiddleware(multiCompiler, {
  serverRendererOptions: { outputPath: clientConfig.output.path },
}));
```

### A painless experience for the developer

Last but not least: the developer experience. Let's quickly recap the steps to integrate SSR into an existing codebase, assuming you're already bundling your code with Webpack :

- create two Webpack configs (`client` and `server`)
- create two server files (`app` and `app.dev`)
- create two entry points (`client` and `server`)
- adapt your app entry (`App`)
- list all of your routes in the three files (`AsyncBundles`, `Bundles` and `routes`)
- adapt route components which render sub-routes so they can also be rendered

And once it is set up, the steps to create a new route:

- add the route in the `Bundles` and `AsyncBundles` files
- also add it in the `routes` file

Aaaaaand that's it! You're all set up and ready to go to production.

_Note on performance:_ in React 15, the `render` function is synchronous on the server, meaning that it could be a performance bottleneck if you have a lot of simultaneous requests. Fortunately, an async `render` [is coming with React 16](https://github.com/facebook/react/issues/10294)! You can already try it by installing `react@next`.

That's pretty much all I have to share on the subject! Feel free to share your thoughts on the subject, and to submit improvements to the [ssr-starter-pack](https://github.com/Zephir77167/ssr-starter-pack) if you think of any!
