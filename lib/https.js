import express from 'express';

const E = {};
export default E;

E.start = ()=>{
  let app = E.app = express();
  app.get('/', function (req, res) {
    res.send('Hello World');
  })
  console.log('https: listen on port 80');
  app.listen(80); // XXX support https
};

E.close = ()=>{}; // XXX: TODO
