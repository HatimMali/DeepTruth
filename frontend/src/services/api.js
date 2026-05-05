import axios from "axios";

const API = axios.create({
  baseURL: "https://deeptruth-nlbop.ondigitalocean.app/api",
});

export const predictTampering = (file) => {
  const formData = new FormData();
  formData.append("file", file);
  return API.post("/predict/tampering", formData);
};

export const predictDeepfake = (file) => {
  const formData = new FormData();
  formData.append("file", file);
  return API.post("/predict/deepfake", formData);
};

export const getHealth = () => API.get("/health");
export const getInfo = () => API.get("/info");