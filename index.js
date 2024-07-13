const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const app = express();
const port =  process.env.PORT ||5000;

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.5jpyllp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {serverApi: {version: ServerApiVersion.v1,strict: true,deprecationErrors: true,}});

function verifyJWT (req, res, next) {
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(401).send({message: 'UnAuthorized access'});
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded) {
        if(err){
            return res.status(403).send({message: 'Forbidden access'});
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try{
        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        });

        app.get('/user',verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({email: email});
            const isAdmin = user.roll === "admin";
            res.send({admin: isAdmin});
        })

        app.put('/user/admin/:email',verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({email: requester});
            if(requesterAccount.roll === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: {roll:'admin'},
                };
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
            else {
                res.status(403).send({message: 'forbidden'});
            }
        }   );

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({email: email},process.env.ACCESS_TOKEN_SECRET,{ expiresIn: '1h' })
            res.send({result, token});
        });


        // Worning:
        // this is not the proper way to query.
        // After learning more about mongodb use aggregate lookup, pipeline, match, group
        app.get('/available', async (req, res) => {
            const date = req.query.date;
            // console.log("Query date parameter:", date);
            // Step 1: get all services
            const services = await serviceCollection.find().toArray();
            // Step 2: get the booking of that day. output: [{},{},{},{},{},{},{},{}];
            const query = {date: date};
            const bookings = await bookingCollection.find(query).toArray();
            // Step 3: foe each service, 
            services.forEach(service => {
                // Step 4: find booking for that service. output: [{},{},{},{}];
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                // Step 5: select slots for the service Bookings: ['', '', '',''];
                const bookedSlots = serviceBookings.map(book => book.slot);
                // Step 6: select those slots that are not in bookedSlots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                // Step 7: set Availabe to slots to make is easier
                // Assign available slots to the service
                service.slots = available;
                // service.available = available; 
            });
            
            // services.forEach(service =>{
            //     const serviceBookings = bookings.filter(b => b.treatment === service.name);
            //     const booked = serviceBookings.map(s => s.slot);
            //     // service.booked = booked;
            //     // service.booked = serviceBookings.map(s => s.slot);
            //     const available = service.slots.filter(s => !booked.includes(s));
            //     service.available = available;  
            // });

            // Send the response
            res.send(services);
        });

        /**
         * API Naming Convention
         * app.get('/booking') // get all bookings in this collection. or get more than one or by filter
         * app.get('/booking/:id') // get a specific booking
         * app.post('/booking') // add a new booking
         * app.patch('/booking/:id) //
         * app.put('/booking/:id') //upsert  ==> update (if exists) or insert (if doesn't exists)
         * app.delete('/booking/:id) //
         */

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if(patient === decodedEmail){
                const query = {patient: patient};
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status9(403).send({message: 'Forbidden access'});
            }
        });

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient};
            const exixts = await bookingCollection.findOne(query);
            if(exixts){
                return res.send({success: false, booking: exixts});
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({success: true, result});
        });

    }
    finally{

    }
}

run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello From Doctors Portal');
});

app.listen(port, () => {
    console.log(`Doctors Portal app listening on port ${port}`);
});