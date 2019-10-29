import LogFactory from '@darkobits/log';

const log = LogFactory({heading: 'dockerize'});

// Disable logging by default so that we don't output anything when the Node
// API is used. The CLI will then set this appropriately.
log.configure({level: 'silent'});

export default log;
