const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const requireAdmin = authMiddleware.requireAdmin;
const Comment = require("../models/Comment");
const Post = require("../models/Post");
const User = require("../models/User");

router.get("/:postId", async (req, res) => {
 const comments = await Comment.find({ postId: req.params.postId })
  .sort({ createdAt: 1 })
  .lean();

 res.json(comments);
});

router.post("/:postId", authMiddleware, async (req, res) => {
 const { content } = req.body;

 if (!content || !content.trim()) {
  return res.status(400).json({ message: "Comment content is required" });
 }

 const post = await Post.findById(req.params.postId);
 if (!post) {
  return res.status(404).json({ message: "Post not found" });
 }

 const user = await User.findById(req.user.id);
 if (!user || !user.isApproved) {
  return res.status(403).json({ message: "User not approved" });
 }

 const comment = await Comment.create({
  postId: post._id,
  authorId: req.user.id,
  authorName: user.name,
  content: content.trim()
 });

 res.status(201).json({ message: "Comment added", comment });
});

router.delete("/:commentId", authMiddleware, async (req, res) => {
 const comment = await Comment.findById(req.params.commentId);

 if (!comment) {
  return res.status(404).json({ message: "Comment not found" });
 }

 if (comment.authorId.toString() !== req.user.id && req.user.role !== "admin") {
  return res.status(403).json({ message: "You can only delete your own comment" });
 }

 await comment.deleteOne();
 res.json({ message: "Comment deleted" });
});

module.exports = router;