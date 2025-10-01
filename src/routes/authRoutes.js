import express from 'express';
import { 
  register, 
  login, 
  getProfile, 
  updateProfile,
  getUsersByType,
  getAllUsers,
  getCertificate,
  registerValidation, 
  loginValidation,
  upload 
} from '../controllers/authController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Public routes
router.post('/register', 
  upload.single('certificate'), // Handle file upload first
  (req, res, next) => {
    // Handle multer errors
    if (req.fileValidationError) {
      return res.status(400).json({
        success: false,
        message: req.fileValidationError
      });
    }
    next();
  },
  registerValidation, 
  register
);

router.post('/login', 
  loginValidation, 
  login
);

// Protected routes
router.get('/profile', 
  authenticateToken, 
  getProfile
);

router.put('/profile', 
  authenticateToken, 
  updateProfile
);

// Admin routes
router.get('/users', 
  authenticateToken, 
  getAllUsers
);

router.get('/users/:userType', 
  authenticateToken, 
  getUsersByType
);

// Certificate download route
router.get('/certificate/:userId', 
  getCertificate
);

export default router;