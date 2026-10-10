const mongoose = require('mongoose');

async function connectDatabase(uri) {
  if (!uri) throw new Error('MONGO_URI is missing. Add your own MongoDB connection string to the .env file.');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('[DB] Connected to MongoDB.');
}

module.exports = { connectDatabase };
