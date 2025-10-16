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
  upload,
  forgotPassword,
  verifyOtp,
  resendOtp,
  resetPassword,
  changePassword,
  googleAuthStart,
  googleAuthCallback,
  facebookAuthStart,
  facebookAuthCallback,
  updateQariDetails,
  uploadQariCertificate
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

// OAuth routes
router.get('/google', googleAuthStart);
router.get('/google/callback', googleAuthCallback);
router.get('/facebook', facebookAuthStart);
router.get('/facebook/callback', facebookAuthCallback);

// Password reset / OTP routes
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/profile', 
  authenticateToken, 
  getProfile
);

router.put('/profile', 
  authenticateToken, 
  updateProfile
);

router.post('/change-password', 
  authenticateToken,
  changePassword
);

// Qari details update
router.put('/qari-details', 
  authenticateToken,
  updateQariDetails
);

// Qari certificate upload
router.post('/qari-certificate', 
  authenticateToken,
  upload.single('certificate'),
  uploadQariCertificate
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