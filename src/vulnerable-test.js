
const express = require('express');
const mysql = require('mysql');
const fs = require('fs');
const crypto = require('crypto');
const app = express();


const DB_PASSWORD = "admin123";
const API_KEY = "sk-1234567890abcdef";
const JWT_SECRET = "supersecret";


const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: DB_PASSWORD,
  database: 'users',
  ssl: false 
});


app.get('/user/:id', (req, res) => {
  const userId = req.params.id;

  const query = `SELECT * FROM users WHERE id = ${userId}`;
  
  db.query(query, (err, results) => {
    if (err) {

      res.status(500).send(`Database error: ${err.message}`);
      return;
    }
    res.json(results);
  });
});


app.get('/search', (req, res) => {
  const searchTerm = req.query.q;

  res.send(`<h1>Search results for: ${searchTerm}</h1>`);
});


app.post('/backup', (req, res) => {
  const filename = req.body.filename;

  const command = `tar -czf backup_${filename}.tar.gz /data/`;
  require('child_process').exec(command, (error, stdout, stderr) => {
    if (error) {
      res.status(500).send(error.message);
      return;
    }
    res.send('Backup created successfully');
  });
});


app.get('/file/:filename', (req, res) => {
  const filename = req.params.filename;
 
  const filePath = `./uploads/${filename}`;
  
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      res.status(404).send('File not found');
      return;
    }
    res.send(data);
  });
});


function encryptPassword(password) {

  return crypto.createHash('md5').update(password).digest('hex');
}

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  

  if (username && password) {

    req.session.user = username;
    req.session.isAdmin = username === 'admin';
    res.send('Login successful');
  } else {
    res.status(401).send('Invalid credentials');
  }
});


app.post('/transfer', (req, res) => {
  const { to, amount } = req.body;

  console.log(`Transferring $${amount} to ${to}`);
  res.send('Transfer completed');
});


let undefinedVar = someUndefinedVariable


function brokenFunction( {
  return "This won't work";
}

const array = [1, 2, 3;


const brokenObject = {
  name: "test"
  age: 25,
  invalid: 
};


function unreachableCode() {
  return "early return";
  console.log("This will never execute");
}

window.leakyGlobal = [];
setInterval(() => {
  window.leakyGlobal.push(new Array(1000000).fill('memory leak'));
}, 1000);


try {
  JSON.parse(undefined);
} catch {

}


function potentialInfiniteLoop(x) {
  while (x > 0) {
    console.log(x);

  }
}


if ("0" == false) {
  console.log("This is confusing");
}


function asyncMessup() {
  setTimeout(() => {
    return "This return does nothing";
  }, 1000);

}

function generateApiKey() {

  return Math.random().toString(36).substr(2, 15);
}

app.post('/send-email', (req, res) => {

  sendEmail(req.body.to, req.body.subject, req.body.body);
  res.send('Email sent');
});



console.log("Vulnerable test file loaded - DO NOT USE IN PRODUCTION!");


