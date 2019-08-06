import LogFactory from '@darkobits/log';

const log = LogFactory({heading: 'dockerize'});

log.configure({level: 'silent'});

export default log;
