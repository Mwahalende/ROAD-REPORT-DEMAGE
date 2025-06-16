/*const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
});

// === Config ===
const EMAIL_USER = 'zumalipas@gmail.com';
const EMAIL_PASS = 'xsds bimk ndlb vmrr';

cloudinary.config({
  cloud_name: 'drxvftof4',
  api_key: '872961783425164',
  api_secret: 'KWEJ6SbPybty7YefACspZ-j-ym0'
});

mongoose.connect('mongodb://127.0.0.1/road_reports')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// === Middleware ===
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// === Global User Socket Tracker ===
let onlineUsers = {};
io.on('connection', socket => {
  socket.on('registerEmail', (email) => {
    onlineUsers[email] = socket.id;
  });
  socket.on('disconnect', () => {
    for (let email in onlineUsers) {
      if (onlineUsers[email] === socket.id) {
        delete onlineUsers[email];
        break;
      }
    }
  });
});

// === Email ===
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});

// === Models ===
const User = mongoose.model('User', new mongoose.Schema({
  userId: String,
  fullname: String,
  email: String,
  role: String,
  passwordHash: String
}));

const PendingUser = mongoose.model('PendingUser', new mongoose.Schema({
  fullname: String,
  email: String,
  role: String,
  status: { type: String, default: 'pending' }
}));

const Role = mongoose.model('Role', new mongoose.Schema({
  name: String
}));

const DamageClass = mongoose.model('DamageClass', new mongoose.Schema({
  damageClass: String,
  description: String,
  repairCost: Number,
  userId: String,
  registerDate: { type: Date, default: Date.now }
}));

const Photo = mongoose.model('Photo', new mongoose.Schema({
  userId: String,
  fullname: String,
  email: String,
  roadName: String,
  damageClass: String,
  comment: String,
  localTime: String,
  photoUrl: String,
  imageId: String,
  location: Object,
  approvalStatus: { type: String, default: 'pending' },
  officerComment: String,
  contractor: String,
  validatedByOfficerId: String,
  validationDate: Date,
  budget: Number,
  dateCreated: { type: Date, default: Date.now }
}));

// === Routes ===

// Roles
app.get('/roles', async (_, res) => {
  const roles = await Role.find();
  res.json(roles);
});

app.post('/roles', async (req, res) => {
  await new Role({ name: req.body.name }).save();
  res.json({ message: 'Role added' });
});

// Check Email
app.get('/check-email', async (req, res) => {
  const exists = await User.findOne({ email: req.query.email }) || await PendingUser.findOne({ email: req.query.email });
  res.json({ exists: !!exists });
});

// Request Registration
app.post('/request-registration', async (req, res) => {
  const { fullname, email, role } = req.body;
  await new PendingUser({ fullname, email, role }).save();
  res.json({ message: 'Registration request submitted.' });
});

// Admin Views Pending
app.get('/pending-users', async (_, res) => {
  const pending = await PendingUser.find({ status: 'pending' });
  res.json(pending);
});

// Admin Approves
app.patch('/approve-user/:id', async (req, res) => {
  const pending = await PendingUser.findById(req.params.id);
  if (!pending) return res.status(404).json({ message: 'User not found' });

  const passwordHash = await bcrypt.hash('123456', 10);
  const userId = 'U' + Date.now();

  const user = new User({
    userId,
    fullname: pending.fullname,
    email: pending.email,
    role: pending.role,
    passwordHash
  });
  await user.save();

  await transporter.sendMail({
    from: EMAIL_USER,
    to: pending.email,
    subject: '🎉 Approved',
    html: `<p>Hello <strong>${pending.fullname}</strong>,<br>Your account as <b>${pending.role}</b> has been approved.<br>Your default password is <b>123456</b>.</p>`
  });

  if (onlineUsers[pending.email]) {
    io.to(onlineUsers[pending.email]).emit('userApproved', {
      message: `🎉 ${pending.fullname}, your account as ${pending.role} was approved!`
    });
  }

  pending.status = 'approved';
  await pending.save();

  res.json({ message: 'User approved.' });
});

// Admin Rejects
app.patch('/reject-user/:id', async (req, res) => {
  await PendingUser.findByIdAndUpdate(req.params.id, { status: 'rejected' });
  res.json({ message: 'User rejected' });
});

// Login
app.post('/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.status(404).json({ message: 'Email not found' });

  const valid = await bcrypt.compare(req.body.password, user.passwordHash);
  if (!valid) return res.status(400).json({ message: 'Invalid password' });

  res.json({
    userId: user.userId,
    fullname: user.fullname,
    email: user.email,
    role: user.role
  });
});

// Forgot Password
app.post('/forgot-password', async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.status(404).json({ message: 'Email not found' });

  const newPass = Math.random().toString(36).slice(-6);
  user.passwordHash = await bcrypt.hash(newPass, 10);
  await user.save();

  await transporter.sendMail({
    from: EMAIL_USER,
    to: user.email,
    subject: '🔐 New Password',
    html: `<p>Your new password is <b>${newPass}</b></p>`
  });

  res.json({ message: 'New password sent to email.' });
});

// Upload Photo (Surveyor)
app.post('/upload-photo', async (req, res) => {
  const { imageData, ...rest } = req.body;
  const upload = await cloudinary.uploader.upload(imageData, { folder: 'road_damage' });
  const photo = new Photo({ ...rest, photoUrl: upload.secure_url, imageId: upload.public_id });
  await photo.save();
  res.json({ message: 'Photo uploaded' });
});

// Get All Photos
app.get('/get-all-photos', async (_, res) => {
  const photos = await Photo.find().sort({ dateCreated: -1 });
  res.json({ photos });
});

// Delete Photo
app.delete('/delete-photo/:id', async (req, res) => {
  const photo = await Photo.findById(req.params.id);
  if (photo) await cloudinary.uploader.destroy(photo.imageId);
  await Photo.findByIdAndDelete(req.params.id);
  res.json({ message: 'Photo deleted' });
});

// Officer Actions
app.patch('/officer-review/:id', async (req, res) => {
  const { approvalStatus, officerComment, contractor, validatedByOfficerId } = req.body;
  await Photo.findByIdAndUpdate(req.params.id, {
    approvalStatus,
    officerComment,
    contractor,
    validatedByOfficerId,
    validationDate: new Date()
  });
  res.json({ message: 'Review updated' });
});

// Manager Budget Update
app.patch('/update-budget/:id', async (req, res) => {
  await Photo.findByIdAndUpdate(req.params.id, { budget: req.body.budget });
  res.json({ message: 'Budget updated' });
});

// Damage Class
app.post('/damage-class', async (req, res) => {
  const { damageClass, description, repairCost, userId } = req.body;
  await new DamageClass({ damageClass, description, repairCost, userId }).save();
  res.json({ message: 'Damage class saved' });
});

app.get('/damage-class', async (_, res) => {
  const list = await DamageClass.find().sort({ registerDate: -1 });
  res.json(list);
});


app.delete('/delete-user/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    await User.deleteOne({ _id: userId });
    await Photo.deleteMany({ userId });
    res.json({ message: 'User and related data deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Delete failed.' });
  }
});

// Start Server
server.listen(3000, () => console.log('🚀 Server running at http://localhost:3000'));
*/



const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
});

// === Config ===
const EMAIL_USER = 'zumalipas@gmail.com';
const EMAIL_PASS = 'xsds bimk ndlb vmrr';

cloudinary.config({
  cloud_name: 'drxvftof4',
  api_key: '872961783425164',
  api_secret: 'KWEJ6SbPybty7YefACspZ-j-ym0'
});

mongoose.connect('mongodb+srv://user1:malafiki@leodb.5mf7q.mongodb.net/mapreport?retryWrites=true&w=majority&appName=leodb' )
.then(() => console.log("Connected to mapreport DB"))
.catch(err => console.error(err));
// === Middleware ===
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// === Socket.IO Trackers ===
let onlineUsers = {};
io.on('connection', socket => {
  socket.on('registerEmail', email => {
    onlineUsers[email] = socket.id;
  });
  socket.on('disconnect', () => {
    for (let email in onlineUsers) {
      if (onlineUsers[email] === socket.id) {
        delete onlineUsers[email];
        break;
      }
    }
  });
});

// === Email Setup ===
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});

// === Schemas ===
const User = mongoose.model('User', new mongoose.Schema({
  userId: String,
  fullname: String,
  email: String,
  role: String,
  passwordHash: String
}));

const PendingUser = mongoose.model('PendingUser', new mongoose.Schema({
  fullname: String,
  email: String,
  role: String,
  status: { type: String, default: 'pending' }
}));

const Role = mongoose.model('Role', new mongoose.Schema({
  name: String
}));

const DamageClass = mongoose.model('DamageClass', new mongoose.Schema({
  damageClass: String,
  description: String,
  repairCost: Number,
  userId: String,
  registerDate: { type: Date, default: Date.now }
}));

const Photo = mongoose.model('Photo', new mongoose.Schema({
  userId: String,
  fullname: String,
  email: String,
  roadName: String,
  damageClass: String,
  comment: String,
  localTime: String,
  photoUrl: String,
  imageId: String,
  location: Object,
  approvalStatus: { type: String, default: 'pending' },
  officerComment: String,
  contractor: String,
  validatedByOfficerId: String,
  validationDate: Date,
  budget: Number,
  dateCreated: { type: Date, default: Date.now }
}));

// === Role Routes ===
app.get('/roles', async (_, res) => {
  const roles = await Role.find();
  res.json(roles);
});

app.post('/roles', async (req, res) => {
  await new Role({ name: req.body.name }).save();
  res.json({ message: 'Role added' });
});

// === Registration + Approval ===
app.get('/check-email', async (req, res) => {
  const exists = await User.findOne({ email: req.query.email }) || await PendingUser.findOne({ email: req.query.email });
  res.json({ exists: !!exists });
});

app.post('/request-registration', async (req, res) => {
  const { fullname, email, role } = req.body;
  await new PendingUser({ fullname, email, role }).save();
  res.json({ message: 'Registration request submitted.' });
});

app.get('/pending-users', async (_, res) => {
  const pending = await PendingUser.find({ status: 'pending' });
  res.json(pending);
});

app.patch('/approve-user/:id', async (req, res) => {
  const pending = await PendingUser.findById(req.params.id);
  if (!pending) return res.status(404).json({ message: 'User not found' });

  const password = '123456';
  const passwordHash = await bcrypt.hash(password, 10);
  const userId = 'U' + Date.now();

  const user = new User({
    userId,
    fullname: pending.fullname,
    email: pending.email,
    role: pending.role,
    passwordHash
  });
  await user.save();

  await transporter.sendMail({
    from: EMAIL_USER,
    to: pending.email,
    subject: '🎉 Approved',
    html: `<p>Hello <strong>${pending.fullname}</strong>,<br>Your account as <b>${pending.role}</b> has been approved.<br>Your default password is <b>${password}</b>.</p>`
  });

  if (onlineUsers[pending.email]) {
    io.to(onlineUsers[pending.email]).emit('registrationStatus', {
      status: 'approved',
      message: '✅ Your account has been approved. You can now login.'
    });
  }

  await PendingUser.findByIdAndDelete(req.params.id);
  res.json({ message: 'User approved and removed from pending.' });
});

app.patch('/reject-user/:id', async (req, res) => {
  const pending = await PendingUser.findById(req.params.id);
  if (!pending) return res.status(404).json({ message: 'User not found' });

  if (onlineUsers[pending.email]) {
    io.to(onlineUsers[pending.email]).emit('registrationStatus', {
      status: 'rejected',
      message: '❌ Your registration was rejected. Please contact admin.'
    });
  }

  await PendingUser.findByIdAndDelete(req.params.id);
  res.json({ message: 'User rejected and removed.' });
});

// === Login / Forgot Password ===
app.post('/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.status(404).json({ message: 'Email not found' });

  const valid = await bcrypt.compare(req.body.password, user.passwordHash);
  if (!valid) return res.status(400).json({ message: 'Invalid password' });

  res.json({
    userId: user.userId,
    fullname: user.fullname,
    email: user.email,
    role: user.role
  });
});

app.post('/forgot-password', async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.status(404).json({ message: 'Email not found' });

  const newPass = Math.random().toString(36).slice(-6);
  user.passwordHash = await bcrypt.hash(newPass, 10);
  await user.save();

  await transporter.sendMail({
    from: EMAIL_USER,
    to: user.email,
    subject: '🔐 New Password',
    html: `<p>Your new password is <b>${newPass}</b></p>`
  });

  res.json({ message: 'New password sent to email.' });
});

// === Photo Upload / Deletion ===
app.post('/upload-photo', async (req, res) => {
  const { imageData, ...rest } = req.body;
  const upload = await cloudinary.uploader.upload(imageData, { folder: 'road_damage' });
  const photo = new Photo({ ...rest, photoUrl: upload.secure_url, imageId: upload.public_id });
  await photo.save();
  res.json({ message: 'Photo uploaded' });
});

app.get('/get-all-photos', async (_, res) => {
  const photos = await Photo.find().sort({ dateCreated: -1 });
  res.json({ photos });
});

app.delete('/delete-photo/:id', async (req, res) => {
  const photo = await Photo.findById(req.params.id);
  if (photo) await cloudinary.uploader.destroy(photo.imageId);
  await Photo.findByIdAndDelete(req.params.id);
  res.json({ message: 'Photo deleted' });
});

// === Officer Review ===
app.patch('/officer-review/:id', async (req, res) => {
  const { approvalStatus, officerComment, contractor, validatedByOfficerId } = req.body;
  await Photo.findByIdAndUpdate(req.params.id, {
    approvalStatus,
    officerComment,
    contractor,
    validatedByOfficerId,
    validationDate: new Date()
  });
  res.json({ message: 'Review updated' });
});

// === Manager Budget ===
app.patch('/update-budget/:id', async (req, res) => {
  await Photo.findByIdAndUpdate(req.params.id, { budget: req.body.budget });
  res.json({ message: 'Budget updated' });
});

// === Damage Class ===
app.post('/damage-class', async (req, res) => {
  const { damageClass, description, repairCost, userId } = req.body;
  await new DamageClass({ damageClass, description, repairCost, userId }).save();
  res.json({ message: 'Damage class saved' });
});

app.get('/damage-class', async (_, res) => {
  const list = await DamageClass.find().sort({ registerDate: -1 });
  res.json(list);
});

// === Admin View & Delete Users ===
app.get('/all-users', async (_, res) => {
  const users = await User.find().sort({ fullname: 1 });
  res.json(users);
});

app.delete('/delete-user/:id', async (req, res) => {
  const userId = req.params.id;
  const user = await User.findById(userId);
  const pending = await PendingUser.findById(userId);

  if (user) {
    const photos = await Photo.find({ userId: user.userId });
    for (let p of photos) {
      if (p.imageId) await cloudinary.uploader.destroy(p.imageId);
    }
    await Photo.deleteMany({ userId: user.userId });
    await User.findByIdAndDelete(userId);
    return res.json({ message: 'Approved user and photos deleted.' });
  }

  if (pending) {
    await PendingUser.findByIdAndDelete(userId);
    return res.json({ message: 'Pending user deleted.' });
  }

  res.status(404).json({ message: 'User not found.' });
});

// === Start Server ===
server.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));
