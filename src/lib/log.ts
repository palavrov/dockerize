import LogFactory from '@darkobits/log';


// Disable logging by default so that we don't output anything when the Node
// API is used. The CLI will then set this appropriately.
const log = LogFactory({heading: 'dockerize', level: 'silent'});


export default log;
