function status(req, res) {
  res.status(200).json({ status: "Index API is running smoothly." });
}

export default status;
