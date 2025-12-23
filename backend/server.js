const express = require('express');
const cors = require('cors');
const { sequelize, LinkedinProfile } = require('./models');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/profiles', async (req, res) => {
  try {
    const profiles = req.body;
    await sequelize.transaction(async (t) => {
      for (const profile of profiles) {
        await LinkedinProfile.create(profile, { transaction: t });
      }
    });
    res.json({ success: true, count: profiles.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save profiles' });
  }
});

app.get('/profiles', async (req, res) => {
  try {
    const profiles = await LinkedinProfile.findAll();
    res.json(profiles);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

const PORT = 3000;
sequelize.sync().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
