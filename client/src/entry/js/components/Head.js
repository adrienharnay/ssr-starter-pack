import React from 'react';
import { Helmet } from 'react-helmet';

const SHORT_TITLE = 'SSR Starter Pack';
const LONG_TITLE = 'Server Side Rendering Starter Pack';
const DESCRIPTION = 'A starter pack to help you implement your handmade solution for SSR';
const KEYWORDS = 'react, ssr, server, side, rendering, webpack';
const VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';

const Head = () => (
  <Helmet>
    <title>{`${LONG_TITLE} ⚡`}</title>

    <meta charSet="utf-8" />
    <meta httpEquiv="X-UA-Compatible" content="IE=edge" />

    <meta name="title" content={SHORT_TITLE} />
    <meta name="author" content={SHORT_TITLE} />
    <meta name="application-name" content={SHORT_TITLE} />
    <meta name="description" content={DESCRIPTION} />
    <meta name="keywords" content={KEYWORDS} />
    <meta name="viewport" content={VIEWPORT} />
  </Helmet>
);

export default Head;
