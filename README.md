# You might (not) need a Server Side Rendering framework

> TL;DR: a repository is all set up for you right [here](https://github.com/Zephir77167/ssr-starter-pack)

At my daily job at [brigad.co](https://brigad.co), I have been using React, React-router and Webpack for quite some time. When we needed to improve our SEO, so we could rank higher in search engines; and Server Side Rendering came as an obvious choice. So I started playing around with the most popular frameworks. To name two:

- [Gatsby](https://www.gatsbyjs.org/)
- [Next](https://learnnextjs.com/)

I would definitely recommend you give them a try if you haven't yet. Just like most people would use [create-react-app](https://github.com/facebookincubator/create-react-app) to start a client side project, they are great to quickly start a new project, while having an awesome community around them, and arguably more features than this _starter_ pack offers.

However, after trying the two for a week or so, I felt like the restrictions which come with a framework would led to too much refactoring, and that it didn't really suit our team. So I went and implemented my own solution, using (almost) only Webpack.

_Disclaimer:_ my aim here is to share my experience trying to implement my own solution, and really not to take side on which solution is best. Pick what works for you!

## What is Server Side Rendering?

First, let's start by explaining what is Client Side Rendering: your server sends an HTML page to the client, with an empty DOM and a script tag which will load your React bundle. The client's browser will parse the React code, transform it into HTML, and inject it in the DOM.  
_Based on their network and CPU, the client could wait ages to see any content._


With Server Side Rendering, your bundle is first transformed into HTML on the server, which is directly sent to the client. But the client's browser will still check that the output from the JS bundle is the same as the HTML the server just sent (it should always be).  
_The client sees the content instantly, instead of having to wait for the Javascript to be parsed._

Server Side Rendering improves loading times, but also search engine ranking, as it will be easier for, say, Google, to crawl your site. Note that Google should be able to crawl sites build with React by now, but for some reason, it was still seeing our site as a blank page before we introduced Server Side Rendering ([How to see how your website looks like to Google](https://www.google.com/webmasters/tools/googlebot-fetch)).

## Requirements

So, let's start with the requirements, based on the needs of our project:

- [Code splitting / Route-based chunk loading on the client](#code-splitting--async-chunk-loading-on-the-client)
- [CSS Modules working without FOUT](#css-modules-working-without-fout)
- [Smaller images inlined with JS, larger images served by S3 (or some other CDN)](#smaller-images-inlined-with-js-larger-images-served-by-s3-or-some-other-cdn)
- [Long-term caching of assets, including chunks (production only)](#long-term-caching-of-assets-including-chunks-production-only)
- [A proper development environment](#a-proper-development-environment)
- [A painless experience for the developer](#a-painless-experience-for-the-developer)

### Code splitting / Async chunk loading on the client

_I want to start by giving credit to Emile Cantin for [his post](https://blog.emilecantin.com/web/react/javascript/2017/05/16/ssr-react-router-4-webpack-code-split.html), which helped me a lot on the subject._

#### What do we want here?

On the client, we want code splitting with async chunk loading, so that the client only downloads chunks which are essentials for the current view.  
On the server, we want only one bundle, but when rendering we will store the names of the chunks that will later be needed on the client.

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

The client version asynchronously loads a component and renders it when it is ready.

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

The server version renders a component synchronously, and stores its name in an array received in parameter. This parameter is [implicitly passed](https://reacttraining.com/react-router/web/guides/server-rendering) by React-router to each route component.

#### How do we use them?

The goal is to have a file (well, two actually) with the list of every route of our app.

[AsyncBundles.js](./client/src/entry/js/components/AsyncBundles.js)

```js
export const MainLayout = asyncComponent(() => import(/* webpackChunkName: "MainLayout" */'src/views/main-layout/js/MainLayout'));
export const Home = asyncComponent(() => import(/* webpackChunkName: "Home" */'src/views/home/js/Home'));
export const Page1 = asyncComponent(() => import(/* webpackChunkName: "Page1" */'src/views/page1/js/Page1'));
export const Page2 = asyncComponent(() => import(/* webpackChunkName: "Page2" */'src/views/page2/js/Page2'));
```

We are using [Webpack magic comments](https://webpack.js.org/guides/code-splitting/#dynamic-imports) to name the chunks. It is a bit tedious to repeat the name of the chunk, but it is on the same line so it should not be hard to maintain.

[Bundles.js](./client/src/entry/js/components/Bundles.js)
```js
export const MainLayout = syncComponent('MainLayout', require('src/views/main-layout/js/MainLayout'));
export const Home = syncComponent('Home', require('src/views/home/js/Home'));
export const Page1 = syncComponent('Page1', require('src/views/page1/js/Page1'));
export const Page2 = syncComponent('Page2', require('src/views/page2/js/Page2'));
```

And the same list, using the other HOC.

#### What do we do with the lists?

It is now time to define the structure of our app. Thanks to [react-router-config](https://github.com/ReactTraining/react-router/tree/master/packages/react-router-config), we can do it all at one place (this will be helpful for the server to know which routes can be rendered).

[routes.js](./client/src/entry/js/components/routes.js)
```js
import { MainLayout, Home, Page1, Page2 } from './Bundles';

const RedirectToHome = () => <Redirect to="/" />;

const routes = (
  <Route component={MainLayout}>

    <Route exact path="/page1" component={Page1} />
    <Route exact path="/page2" component={Page2} />
    <Route exact path="/" component={Home} />

    <Route component={RedirectToHome} />
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

With this awesome package, and the `getChildRoutes` function, we will be able to define our routes in a declarative way, and of course we can nest them as we please.

There is one little catch though: when we nest routes, the parent route must contain following code so it can render its children routes:

[MainLayout.js](./client/src/views/main-layout/js/MainLayout.js)
```js
import { renderRoutes } from 'react-router-config';

const MainLayout = ({ route: { routes } }) => (
  <div>
    {renderRoutes(routes)}
  </div>
);
```

#### How do we do the difference between the client and server versions?

With the use of `webpack.NormalModuleReplacementPlugin`! Client side, it will replace occurrences of `Bundle` with `AsyncBundle`.

[webpack.config.client.js](./webpack.config.client.js)
```js
const plugins = [
  new webpack.NormalModuleReplacementPlugin(/\/components\/Bundles/, './components/AsyncBundles'),
  new webpack.NormalModuleReplacementPlugin(/\/Bundles/, './AsyncBundles'),
];
```

I used two because I import `AsyncBundles` twice from two different paths.

#### Putting the pieces together

For all of this to work together, we will create two entry points.

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
    return res.redirect(302, context.url);
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

The server entry will generate the markup on the server and send it to the client. A few things to note:
- if a redirection happens during the rendering of the App, it will immediately redirect the client, and they will only receive one markup
- we are using [react-helmet](https://github.com/nfl/react-helmet) to generate dynamic head tag
- we are injecting the `splitPoints` and `serverSideHeaders` in the window, so the client can use them
- we are importing the CSS file and JS chunks differently whether we are in development mode or production, but we will cover that later
- we are using [pace.js](http://github.hubspot.com/pace/docs/welcome/) to show the user the site isn't responsive yet, but this is a matter of preference and totally optional

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

The client entry will receive the splitPoints (which are the chunks needed for the request), load them, and wait for them to be ready to render. It will also receive the server side headers because it is often useful to have access to headers we otherwise couldn't access from the client (e.g. Accept-Language or custom headers).

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

This component will render the Head (containing meta tags), and the right router (browser or static) based on the type of the App.

[Head.js](./client/src/entry/js/components/Head.js)
```js
const Head = () => (
  <Helmet>
    <title>{'Server Side Rendering Starter Pack'}</title>

    <meta charSet="utf-8" />
    <meta httpEquiv="X-UA-Compatible" content="IE=edge" />

    <meta name="title" content="SSR Starter Pack" />
    <meta name="author" content="Adrien HARNAY" />
    <meta name="application-name" content="SSR Starter Pack" />
    <meta name="description" content="A starter pack to help you implement your own solution for SSR" />
    <meta name="keywords" content="react, ssr, server, side, rendering, webpack" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  </Helmet>
);
```

Here we have meta tags which can be overridden anywhere in the app. 

[ServerRouting.js](./client/src/entry/js/components/ServerRouting.js)
```js
import { renderRoutes } from 'react-router-config';

import routes from './routes';

const ServerRouting = ({ url, context }) => (
  <StaticRouter location={url} context={context}>
    {renderRoutes(routes)}
  </StaticRouter>
);
```

[ClientRouting.js](./client/src/entry/js/components/ClientRouting.js)
```js
import { renderRoutes } from 'react-router-config';

import routes from './routes';

const ClientRouting = () => (
  <BrowserRouter>
    {renderRoutes(routes)}
  </BrowserRouter>
);
```

Finally, the last pieces of the puzzle! Nothing fancy here, we are following the [React-router docs](https://reacttraining.com/react-router/) and using the appropriate router for each side.

### CSS Modules working without FOUT

We got JS covered, but what about CSS? If you ever tried using [style-loader](https://github.com/webpack-contrib/style-loader) in SSR, you will know it doesn't work on the server. _People using CSS in JS are laughing in the back of the room._ Well, we're using CSS Modules and we're not giving up this easy!
 
The solution here is rather simple. We will use [extract-text-webpack-plugin](https://github.com/webpack-contrib/extract-text-webpack-plugin) on the server to bundle our CSS in a separate file, which will be requested by the HTML we send to our users.  
While we're at it, we should use [autoprefixer](https://github.com/postcss/autoprefixer) with a [.browserslistrc](https://github.com/ai/browserslist) to make sure our CSS works on every browser we wish to support!

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

And if you remember, in the markup we will send to the client:

[server.js](./client/src/entry/js/server.js)
```js
<link rel="stylesheet" href="${!manifests.server ? '/dist/server/main.css' : manifests.server['main.css']}" />
```

CSS is covered too, and easily! We haven't noticed any Flash of Unstyled Content with this approach (testing with throttled connection), so I think you are good to continue reading!

_Note:_ my initial idea was to use something like [purifycss](https://github.com/purifycss/purifycss) to strip any CSS not used by the HTML we would send to the user, and inline the result in the head. Unfortunately, after several tests I couldn't manage to make it work under 4 seconds for fairly small pages.

### Smaller images inlined with JS, larger images served by S3 (or some other CDN)

The goal here is to inline small images so they can load instantly, without adding to much weight to our JS bundles. First, we will define a breakpoint between small and large images. Let's say 20kb.

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
_For this rule, use the same config on the server than on the client, except for `emitFile: false` on the server_


Thanks to [url-loader](https://github.com/webpack-contrib/url-loader), images which weigh less than 20kb after compression will be inlined, while larger images will be loaded by the browser.

_Did you say compression?_

Yes! While we're at it, we will use [image-webpack-loader](https://github.com/tcoopman/image-webpack-loader) which provides a way to compress images at build time, so we can ensure our users only download the most optimized content.

And voila! Images are generated by the client build, and ignored by the server build (because the output would be the same).

#### Storing them on a CDN

Now, how do we store our images on a CDN and access them?

For the storing part, just put your images on a S3 bucket or some other CDN.

[webpack.config.client.js](./webpack.config.client.js)
```js
const PUBLIC_PATH = !IS_PRODUCTION || IS_LOCAL ? '/dist/' : process.env.ASSETS_URL;
```

As for accessing them, provide ASSETS_URL to the `build` script in [package.json](./package.json), and it will replace `dist` with the proper URL! Your images will be loaded from `dist` in development, and from your CDN in production.

_Tip: you can always use `build:local` to debug your app in a production environment, being able to access your assets from `dist_

### Long-term caching of assets, including chunks (production only)

One step away from production! But what about cache? What is the point of providing a blazing-fast website when the user has to download every asset every time he visits it?

If you're not familiar with the notion of long-term caching, I suggest you read the [docs from Webpack](https://webpack.js.org/guides/caching/). Basically, it allows for your assets to be cached indefinitely, unless their content changes. Note that this only affects production build, as you don't want any cache in development.

#### Bundling node modules in a vendors chunk

Node modules are heavy, and change less often than your code. It would be a shame if the client would have to download node modules all over again each time a new feature is deployed! It _would_, but isn't, because we will bundle our node modules in a separate chunk, which will only be invalidated when dependencies get updated.

Also, code which is common to multiple chunks could be exported to a separate chunk so it only gets downloaded once (and when it changes, of course).

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

[webpack.config.server.js](./webpack.config.server.js)
```js
const nodeExternals = require('webpack-node-externals');

externals: [nodeExternals()],
```

And on the server, we don't even bundle node modules, as they are accessible from the `node_modules` folder.

#### Generating hashes in our assets names

For every asset, we will want to have a hash based on the content of the chunk, so that if even one byte changed, the hash would too. We will achieve this by specifying a content hash in our assets names.

[webpack.config.client.js](./webpack.config.client.js)
```js
const rules = {
  {
    loader: 'url-loader',
    options: {
      name: 'images/[name].[hash].[ext]',  
    },
  },
};
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
const rules = {
  {
    loader: 'url-loader',
    options: {
      name: 'images/[name].[hash].[ext]',
    },
  },
};
```

Also, we will use [md5-hash-webpack-plugin](https://github.com/adventure-yunfei/md5-hash-webpack-plugin) for more consistent hashes.

[webpack.config.client.js](./webpack.config.client.js)
```js
const Md5HashPlugin = require('md5-hash-webpack-plugin');

const prodPlugins = [
  new Md5HashPlugin(),
];
```

#### Mapping hashed names to predictable names

How will we include our assets in the document if their name is dynamic? Well, we will have to generate files which will map predictable chunk names to dynamic ones. In order to do this, we will use [webpack-manifest-plugin](https://github.com/danethurber/webpack-manifest-plugin).

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

This code will output two files, which we will call **manifests**.

#### Including assets in the document

The last step is to include our assets in the document.

[app.js](./app.js)
```js
const manifests = {};
manifests.server = require('./public/dist/server-manifest');
manifests.client = require('./public/dist/client-manifest');

app.use(serverRender(manifests));
```

_Note: in development, `serverRender` will also get called (by Webpack-dev-server) with an object as a parameter_

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

And this is it! Your user will download your content once, and keep it in cache until it changes.

### A proper development environment

I talked a lot about the production setup, but what about development? It is quite similar to production, except we add hot reloading on the server and client, meaning we don't have to rebuild between files changes.

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

We will get rid of sourcemaps and hashes, for faster builds, because we have to build twice (one for the server, once for the client).

### A painless experience for the developer

Last but not least: the developer experience. Let's quickly recap the steps to integrate SSR into an existing codebase, assuming you're already bundling your code with Webpack and using React-router :

- create two Webpack configs (`client` and `server`)
- create two server files (`app` and `app.dev`)
- create two entry points (`client` and `server`)
- adapt your app entry (`App`)
- list all of your routes in the three files (`AsyncBundles`, `Bundles` and `routes`)
- adapt route components which render sub-routes so they can also be rendered

_When I said create, you obviously read **borrow from this article**_

And once it is set up, the steps to create a new route:

- add the route in the `Bundles` and `AsyncBundles` files
- also add it in the `routes` file

Aaaaaand that's it! You are all set up and ready to go to production. We have found this setup to be quite effective, and have been using it on [Amazon Elastic Beanstalk](https://aws.amazon.com/fr/elasticbeanstalk/) with a proper load-balancing configuration for a few months now. 

_Note on performance:_ in React 15, the `render` function is synchronous on the server, meaning that it could be a performance bottleneck if you have a lot of simultaneous requests. Fortunately, an async `render` [is coming with React 16](https://github.com/facebook/react/issues/10294)! You can already try it by installing `react@next`.

That's pretty much all I have to share on the subject! Feel free to share your thoughts, to point out any mistakes I would have made and to submit improvements to the [ssr-starter-pack](https://github.com/Zephir77167/ssr-starter-pack)! PRs are more than welcome. Also, feel free to come discuss on the **#ssr** channel of [Reactiflux](https://www.reactiflux.com/)!
