const express = require("express");
const router = express.Router();
const Post = require("../models/Post");
const authMiddleware = require("../middleware/authMiddleware");
const User = require("../models/User");
const Comment = require("../models/Comment");
const jwt = require("jsonwebtoken");

const requireAdmin = authMiddleware.requireAdmin;

const buildTags = value => {
 if (Array.isArray(value)) {
  return value.map(tag => String(tag).trim()).filter(Boolean).slice(0, 8);
 }

 if (typeof value === "string") {
  return value.split(",").map(tag => tag.trim()).filter(Boolean).slice(0, 8);
 }

 return [];
};

const isOwner = (post, userId) => post.authorId && post.authorId.toString() === userId;
const canEdit = (post, user) => isOwner(post, user.id) || user.role === "admin";


// CREATE POST
router.post("/", authMiddleware, async (req, res) => {
 const { title, content, category, postType, link } = req.body;
 const tags = buildTags(req.body.tags);

 if (!title || !content) {
  return res.status(400).json({ message: "Title and content are required" });
 }

 const user = await User.findById(req.user.id);

 if (!user || !user.isApproved) {
  return res.status(403).json({ message: "User not approved" });
 }

 const post = new Post({
  title: title.trim(),
  content: content.trim(),
  category: category?.trim() || "General",
  postType: postType?.trim() || "discussion",
  link: link?.trim() || "",
  tags,
  authorId: req.user.id,
  authorName: user.name,
  authorMID: user.MID
 });

 await post.save();

 res.status(201).json({message: "Post created", post});
});


//GET ALL POSTS
router.get("/", async (req, res) => {
 const {
  search = "",
  category = "",
  postType = "",
  mine = "false",
  page = "1",
  limit = "10"
 } = req.query;

 const currentPage = Math.max(parseInt(page, 10) || 1, 1);
 const pageSize = Math.max(parseInt(limit, 10) || 10, 1);
 const filter = {};

 if (mine === "true") {
    const header = req.header("Authorization");

    if (!header) {
     return res.status(401).json({ message: "No token, access denied" });
    }

    try {
     const token = header.startsWith("Bearer ") ? header.slice(7) : header;
     const decoded = jwt.verify(token, process.env.JWT_SECRET);
     filter.authorId = decoded.id;
    } catch (error) {
     return res.status(401).json({ message: "Invalid token" });
  }
 }

 if (category) {
  filter.category = category;
 }

 if (postType) {
  filter.postType = postType;
 }

 if (search) {
  const regex = new RegExp(search, "i");
  filter.$or = [
   { title: regex },
   { content: regex },
   { category: regex },
   { postType: regex },
   { authorName: regex },
   { tags: regex }
  ];
 }

 const total = await Post.countDocuments(filter);
 const posts = await Post.find(filter)
  .sort({ isPinned: -1, createdAt: -1 })
  .skip((currentPage - 1) * pageSize)
  .limit(pageSize)
  .lean();

 res.json({
  posts,
  pagination: {
   page: currentPage,
   limit: pageSize,
   total,
   totalPages: Math.max(Math.ceil(total / pageSize), 1)
  }
 });
});


// UPDATE POST
router.put("/:id", authMiddleware, async (req, res) => {
 const post = await Post.findById(req.params.id);

 if (!post) {
  return res.status(404).json({ message: "Post not found" });
 }

 if (!canEdit(post, req.user)) {
  return res.status(403).json({ message: "You can only edit your own post" });
 }

 const updates = ["title", "content", "category", "postType", "link"];

 updates.forEach(field => {
  if (typeof req.body[field] === "string") {
   post[field] = req.body[field].trim();
  }
 });

 if (req.body.tags !== undefined) {
  post.tags = buildTags(req.body.tags);
 }

 await post.save();

 res.json({ message: "Post updated", post });
});


// DELETE POST
router.delete("/:id", authMiddleware, async (req, res) => {
 const post = await Post.findById(req.params.id);

 if (!post) {
  return res.status(404).json({ message: "Post not found" });
 }

 if (!canEdit(post, req.user)) {
  return res.status(403).json({ message: "You can only delete your own post" });
 }

 await Comment.deleteMany({ postId: post._id });
 await post.deleteOne();

 res.json({ message: "Post deleted" });
});


// TOGGLE UPVOTE
router.put("/:id/upvote", authMiddleware, async (req, res) => {
 const post = await Post.findById(req.params.id);

 if (!post) {
  return res.status(404).json({ message: "Post not found" });
 }

 const userId = req.user.id.toString();
 const alreadyUpvoted = post.upvotedBy.some(id => id.toString() === userId);

 if (alreadyUpvoted) {
  post.upvotedBy = post.upvotedBy.filter(id => id.toString() !== userId);
  post.upvotes = Math.max((post.upvotes || 0) - 1, 0);
 } else {
  post.upvotedBy.push(req.user.id);
  post.upvotes = (post.upvotes || 0) + 1;
 }

 await post.save();

 res.json({
  message: alreadyUpvoted ? "Upvote removed" : "Post upvoted",
  upvotes: post.upvotes
 });
});


// PIN OR UNPIN POST
router.patch("/:id/pin", authMiddleware, requireAdmin, async (req, res) => {
 const post = await Post.findById(req.params.id);

 if (!post) {
  return res.status(404).json({ message: "Post not found" });
 }

 post.isPinned = !post.isPinned;
 await post.save();

 res.json({ message: post.isPinned ? "Post pinned" : "Post unpinned", post });
});


module.exports = router;