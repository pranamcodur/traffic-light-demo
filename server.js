const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

// --- Configuration & State ---
const API_KEY = "demo-secret-123";
let currentState = "red";
const validStates = ['red', 'amber', 'green'];
let cycleInterval = null;

// --- Middleware: API Security & Debugger ---
const apiGuardAndLog = (req, res, next) => {
    const authHeader = req.headers['x-api-key'];
    const startTime = Date.now();
    
    const oldSend = res.send;
    res.send = function (data) {
        const logEntry = {
            method: req.method,
            path: req.path,
            headers: req.headers,
            payload: req.body,
            status: res.statusCode,
            responseTime: `${Date.now() - startTime}ms`,
            timestamp: new Date().toLocaleTimeString()
        };
        io.emit('api-log', logEntry);
        return oldSend.apply(res, arguments);
    };

    if (authHeader !== API_KEY) {
        return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
    }
    next();
};

// --- API Routes ---
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// 1. Get current state
app.get('/api/state', apiGuardAndLog, (req, res) => {
    res.json({ state: currentState });
});

// 2. Set state manually
app.post('/api/state', apiGuardAndLog, (req, res) => {
    const { state } = req.body;
    if (!validStates.includes(state)) {
        return res.status(400).json({ error: "Invalid state. Use red, amber, or green." });
    }
    
    // Stop any running cycle if manual change occurs
    if (cycleInterval) {
        clearInterval(cycleInterval);
        cycleInterval = null;
    }

    currentState = state;
    io.emit('state-change', currentState);
    res.json({ message: `Traffic light changed to ${state}`, state: currentState });
});

// 3. Get valid colors (Requested)
app.get('/api/colors', apiGuardAndLog, (req, res) => {
    res.json({ supportedColors: validStates, count: validStates.length });
});

// 4. Cycle through lights (Extra Demo Feature)
app.post('/api/cycle', apiGuardAndLog, (req, res) => {
    if (cycleInterval) {
        clearInterval(cycleInterval);
        cycleInterval = null;
        return res.json({ message: "Cycle stopped" });
    }

    res.json({ message: "Cycle started" });

    let direction = 1; // 1 for forward (Red -> Green), -1 for backward (Green -> Red)

    // Inside the /api/cycle interval European Style:
    cycleInterval = setInterval(() => {
        const currentIndex = validStates.indexOf(currentState);
        
        // Determine the next index
        let nextIndex = currentIndex + direction;
    
        // Check boundaries and flip direction if necessary
        if (nextIndex >= validStates.length) {
            // We were at Green, now go back to Amber
            direction = -1;
            nextIndex = validStates.length - 2; 
        } else if (nextIndex < 0) {
            // We were at Red, now go forward to Amber
            direction = 1;
            nextIndex = 1;
        }
    
        currentState = validStates[nextIndex];
        io.emit('state-change', currentState);
    }, 2000);

    /* USA Style
    cycleInterval = setInterval(() => {
        const currentIndex = validStates.indexOf(currentState);
        const nextIndex = (currentIndex + 1) % validStates.length;
        currentState = validStates[nextIndex];
        io.emit('state-change', currentState);
    }, 2000); // Change every 2 seconds
    */
});

//server.listen(3000, () => {
//    console.log('Traffic Light Demo running at http://localhost:3000');
//});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Traffic Light Demo running on port ${PORT}`);
});

