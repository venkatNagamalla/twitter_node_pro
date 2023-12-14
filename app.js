const express = require("express");
const app = express();
app.use(express.json());
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Starting server at http://localhost:3000")
    );
  } catch (e) {
    console.log(e.message);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeaders = request.headers["authorization"];
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payLoad) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payLoad.username;
        request.userId = payLoad.userId;
        next();
      }
    });
  }
};

const tweetsAuthentication = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  console.log(tweetId);
  const getTweetQuery = `
      SELECT * FROM tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id
      WHERE tweet.tweet_id = ${tweetId} AND follower_user_id = ${userId};
    `;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

const getUserIdUsingUsername = async (username) => {
  const getUserId = `
       SELECT 
         follower.following_user_id
       FROM follower INNER JOIN user ON user.user_id = follower.follower_user_id
       WHERE user.username = '${username}';
    `;
  const followingPeople = await db.all(getUserId);
  const arrayOfIds = followingPeople.map(
    (eachPeople) => eachPeople.following_user_id
  );
  return arrayOfIds;
};

//testing api-1
app.get("/users/", async (request, response) => {
  const getAllUsersQuery = `
       SELECT * FROM user;
    `;
  const allUsers = await db.all(getAllUsersQuery);
  response.send(allUsers);
});

//testing api-2
app.get("/tweets/", async (request, response) => {
  const getTweetsQuery = `
      SELECT * FROM tweet;
    `;
  const allTweets = await db.all(getTweetsQuery);
  response.send(allTweets);
});

//api-1 register
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = `
     SELECT * FROM user WHERE username = '${username}';
  `;
  const dbUser = await db.get(getUserQuery);
  const hashedPassword = await bcrypt.hash(password, 10);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const addNewUserQuery = `
         INSERT INTO user (username, password, name, gender)
         VALUES (
             '${username}',
             '${hashedPassword}',
             '${name}',
             '${gender}'
         );
      `;
      await db.run(addNewUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//api-2 login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
     SELECT * FROM user WHERE username = '${username}';
  `;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payLoad = { username: username, userId: dbUser.user_id };
      const jwtToken = jwt.sign(payLoad, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//api-3
app.get("/user/tweets/feed", authenticationToken, async (request, response) => {
  const { username } = request;
  const followingPeopleId = await getUserIdUsingUsername(username);
  const getTweetsQuery = `
     SELECT 
       username, tweet, date_time AS dateTime
     FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
     WHERE user.user_id IN (${followingPeopleId})
     ORDER BY date_time DESC LIMIT 4;
  `;
  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

//api-4
app.get("/user/following/", authenticationToken, async (request, response) => {
  const { username, userId } = request;
  const getFollowingQuery = `
    SELECT name FROM user INNER JOIN follower ON user.user_id = follower.following_user_id
    WHERE follower_user_id = '${userId}';
  `;
  const followingUsers = await db.all(getFollowingQuery);
  response.send(followingUsers);
});

//api-5
app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { username, userId } = request;
  const getFollowersQuery = `
       SELECT DISTINCT name FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id 
       WHERE following_user_id ='${userId}';
    `;
  const followers = await db.all(getFollowersQuery);
  response.send(followers);
});

//api-6
app.get(
  "/tweets/:tweetId",
  authenticationToken,
  tweetsAuthentication,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const getTweetDetailsQuery = `
       SELECT tweet,
       (SELECT COUNT() FROM like WHERE tweet_id = ${tweetId}) AS likes,
       (SELECT COUNT() FROM reply WHERE tweet_id = ${tweetId}) AS replies,
       date_time AS dateTime
       FROM tweet
       WHERE tweet.tweet_id = ${tweetId};
    `;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  }
);

//api-7
app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  tweetsAuthentication,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery = `
       SELECT username FROM user INNER JOIN like ON user.user_id = like.user_id
       WHERE tweet_id = '${tweetId}' ;
    `;
    const likes = await db.all(getLikesQuery);
    const userArray = likes.map((eachUser) => eachUser.username);
    response.send({ likes: userArray });
  }
);

//api-8
app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  tweetsAuthentication,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliesQuery = `
       SELECT name, reply FROM user INNER JOIN reply ON user.user_id = reply.user_id WHERE tweet_id = '${tweetId}';
    `;
    const repliesArray = await db.all(getRepliesQuery);
    response.send({ replies: repliesArray });
  }
);

//api-9
app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { userId } = request;
  const getAllTweetsQuery = `
      SELECT tweet, 
      COUNT(DISTINCT like_id) AS likes,
      COUNT(DISTINCT reply_id) AS replies,
      date_time AS dateTime
      FROM tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id 
      LEFT JOIN like ON tweet.tweet_id = like.tweet_id
      WHERE tweet.user_id = ${userId}
      GROUP BY tweet.tweet_id;
    `;
  const tweetsArray = await db.all(getAllTweetsQuery);
  response.send(tweetsArray);
});

//api-10
app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { tweet } = request.body;
  const userId = request.userId;
  const dateTime = new Date();
  const createNewQuery = `
     INSERT INTO tweet(tweet, user_id, date_time)
     VALUES (
         '${tweet}',
         '${userId}',
         '${dateTime}'
     );
  `;
  await db.run(createNewQuery);
  response.send("Created a Tweet");
});

//api-11
app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;
    const getUserQuery = `
      SELECT * FROM tweet WHERE tweet_id = ${tweetId} AND user_id = ${userId};
    `;
    const tweet = await db.get(getUserQuery);
    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
            DELETE FROM tweet WHERE tweet_id = ${tweetId};
        `;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);
module.exports = app;
