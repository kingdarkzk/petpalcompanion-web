require('dotenv').config();
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');

// This block will work for now...
// but long-term we want to move the URI to a .env file 
const { MongoClient } = require('mongodb');
// This URI is the most important part 
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
try
{
    client.connect();
}
catch (e)
{
    console.log(e);
}



// Send-grid object 
const sgMail = require('@sendgrid/mail');
// Verification stuff (json web-token)
const jwtLib = require('jsonwebtoken');
// jwt (json web token)
// const jwt = require('./createJWT');

const cors = require('cors');
const { createBrotliCompress } = require('zlib');
const { send } = require('process');
const app = express();

// mongoose.connect('mongodb://');

// HTML stuff 
app.use(cors());
app.use(bodyParser.json());
app.use((req, res, next) => {  
    res.setHeader('Access-Control-Allow-Origin', '*');  
    res.setHeader('Access-Control-Allow-Headers',    
    'Origin, X-Requested-With, Content-Type, Accept, Authorization');  
    res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, DELETE, OPTIONS');  
    next();
});

// Something to do with heroku server?
if (process.env.NODE_ENV === 'production') 
{
  // Set static folder
  app.use(express.static(path.join(__dirname, 'frontend', 'build')));

  app.get('*', (req, res, next) => 
  {
    res.sendFile(path.join(__dirname, 'frontend', 'build', 'index.html'));
  });
}

if (process.env.NODE_ENV === 'production') 
{
  // Set static folder
  app.use(express.static(path.join(__dirname, 'frontend', 'build')));

  app.get('*', (req, res, next) => 
  {
    res.sendFile(path.join(__dirname, 'frontend', 'build', 'index.html'));
  });
}

// Login functionality
// API ENDPOINT HTML call to the server
app.post('/api/login', async (req, res, next) => {
    const {email, password} = req.body;
    const db = client.db();

    // Stores all current users in an array (email, password)
    const results = await(db.collection('Users').find({email: email, password: password})).toArray();
    var userID = -1;
    var firstname = '';
    var lastname = '';
    var error = '';

    var ret = "";

    console.log(results);
    if (results.length > 0) 
    {
        const body = results[0];
        // If user has not been verified yet then spit out an error
        // Verification needs to be done through the email system 
        if(body.verified == false)
        {
            error = "Account is not verified";
        }
        else
        {
            userID = body._id;
            firstname = body.firstname;
            lastname = body.lastname;
        }
        
    }
    else
    {
        error = "Login or password is incorrect";
    }

    // res.json({firstname: firstname, lastname: lastname, userID: userID, error: error});
    res.status(200).json({error: error, userID: userID, firstName: firstname, lastName: lastname});
});

// User registration functionality 
// API registering a user
app.post('/api/register', async (req, res, next) => {
    const {firstname, lastname, email, password} = req.body;
    const db = client.db();
    var error = '';

    // Stores the existing users into an array (email)
    const results = await(db.collection('Users').find( {email : email} )).toArray();
    
    // If the user already exists in the database 
    if (results.length > 0)
    {
        res.status(200).json({
            error: "The user already exists"
        });
        return;
    }
    else
    {
        var emailToken = '';   
        try
        {
            // If user does not exist yet, enter the information into the database collection 
            db.collection('Users').insertMany([ 
               {firstname: firstname,
                lastname: lastname,
                email: email,
                password: password,
                verified: false}
            ]);
            
            // sgMail.setApiKey(process.env.SENDGRID_API_KEY);

            // JWT For Email Verification (json web token)
            // emailToken = jwtLib.sign(
            // {
            //     email: email
            // }, process.env.SENDGRID_API_KEY,
            // {
            //     // one day expiration timer
            //     expiresIn: "1d"
            // });
            
            // // Compose message for Email
            // const msg = {
            //     from: 'petpalnotifications@gmail.com',
            //     to: email,
            //     subject: 'Pet Pal - Email Verification',
            //     text: `
            //     Hello!
            //     Thank you for registering to Pet Pal! Please click the link below to verify your account:
            //     http://${req.headers.host}/verifyEmail?token=${emailToken}
            //     `,
            //     html:`
            //     <h1>Hello!</h1>
            //     <p>Thank you for registering to Pet Pal!</p>
            //     <p>Please click the link below to verify your account.</p>
            //     <a href = "http://${req.headers.host}/verifyEmail?token=${emailToken}">Verify your account.</a>
            //     `
            // };

            // console.log("Email sent!");
            
            // // Throws error if email does not exist 
            // sgMail.send(msg)
            // .catch((err) => {
            //     error = err;
            // });
        }    
        catch(e)
        {
            error = e.message;
        }
        res.status(200).json({error: error, token: emailToken});
    }
    
});

// Email verification functionality 
// API for email verfication 
app.post('/api/verifyEmail', async(req, res, next) => {
    var error = '';
    const db = client.db();
    const {token} = req.body;
    try
    {
        const email = jwtLib.verify(token, process.env.SENDGRID_API_KEY);
        var user = await db.collection('Users').findOne({email: email.email}, {_id:0, verified:1});
        // If the email is already verified 
        if (user && user.verified)
        {
            error = "Email is already verified, please log in"; 
        }
        // Verify the email
        else if (user)
        {
            db.collection('Users').updateOne({email: email.email}, {$set: {verified: true}});
        }
        // User is invalid 
        else
        {
            error = "User does not exist";
        }
    }
    catch(error)
    {
        return res.status(200).json({error: error});
    }
    return res.status(200).json({error: error});
});

// Send password reset email functionality 
// API reset password functionality 
app.post('/api/sendReset', async(req, res, next) => {
    const {email} = req.body;
    const db = client.db();
    var error = '';
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    emailToken = jwtLib.sign(
    {
        email: email
    }, process.env.SENDGRID_API_KEY,
    {
        // Token expires in one day
        expiresIn: "1d"
    });
    try
    {
        // Get user with the associated email 
        var user = await db.collection('Users').findOne({email: email});

        // If the user does not exist
        if (!user)
        {
            return res.status(200).json({error: "Account with specified email does not exist"});
        }

        // Compose message
        const msg = {
        from: 'petpalnotifications@gmail.com',
        to: email,
        subject: 'Pet Pal Password Reset',
        text: `
        Verification Code:`
        + emailToken +
        `
        http://${req.headers.host}/resetPassword
        `,
        html:`
        <p>Verification Code: </p>
        ` + emailToken +
        `
        <a href = "http://${req.headers.host}/resetPassword">Reset password.</a>
        `
        }
        sgMail.send(msg)
        .catch((err) => {
            error = err;
        });
    }
    catch(e)
    {
        console.log(e);
        error = e;
    }
    return res.status(200).json({error: error});
});

// Reset password functionality 
// API reset password functionality
app.post('/api/resetPassword', async(req, res, next) => {
    var error = '';
    const db = client.db();
    const {password, token} = req.body;
    try
    {
        const email = jwtLib.verify(token, process.env.SENDGRID_API_KEY);
        if (!email)
        {
            error = "Incorrect verification code";
        }
        // Updates user information 
        else
        {
            db.collection('Users').updateOne({email: email.email}, {$set: {password: password}});
        }
    }
    catch(error)
    {
        return res.status(200).json({error: error});
    }

    return res.status(200).json({error: error});
});

app.listen(process.env.PORT || 5000); // start Node + Express server on port 5000