const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite'
});

const LinkedinProfile = sequelize.define('LinkedinProfile', {
  name: { type: DataTypes.STRING, allowNull: false },
  url: { type: DataTypes.STRING, allowNull: false },
  about: { type: DataTypes.TEXT },
  bio: { type: DataTypes.TEXT },
  location: { type: DataTypes.STRING },
  follower_count: { type: DataTypes.INTEGER },
  connection_count: { type: DataTypes.INTEGER },
  bio_line: { type: DataTypes.STRING }
});

module.exports = { sequelize, LinkedinProfile };
