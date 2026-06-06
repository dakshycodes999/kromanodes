// KromaNodes Interactive Script

document.addEventListener('DOMContentLoaded', () => {
    // 1. Navbar Scroll Effect
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // 2. Mobile Menu Toggle
    const menuToggle = document.getElementById('menu-toggle');
    const navMenu = document.getElementById('nav-menu');
    
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            menuToggle.classList.toggle('open');
            navMenu.classList.toggle('open');
        });
        
        // Close menu on click of nav links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                menuToggle.classList.remove('open');
                navMenu.classList.remove('open');
            });
        });
    }

    // 3. FAQ Accordion
    const faqQuestions = document.querySelectorAll('.faq-question');
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const parent = question.parentElement;
            const isOpen = parent.classList.contains('open');
            
            // Close all open FAQs
            document.querySelectorAll('.faq-item').forEach(item => {
                item.classList.remove('open');
                item.querySelector('.faq-answer').style.maxHeight = null;
            });
            
            // Toggle current if it was not open
            if (!isOpen) {
                parent.classList.add('open');
                const answer = parent.querySelector('.faq-answer');
                answer.style.maxHeight = answer.scrollHeight + 'px';
            }
        });
    });

    // 4. Stats Counter Animation
    const stats = [
        { id: 'stat-servers', target: 2410, suffix: '+', current: 0 },
        { id: 'stat-ram', target: 4.8, suffix: ' TB', current: 0, isFloat: true },
        { id: 'stat-discord', target: 12500, suffix: '+', current: 0 },
        { id: 'stat-uptime', target: 99.9, suffix: '%', current: 0, isFloat: true }
    ];

    const animateStats = () => {
        stats.forEach(stat => {
            const element = document.getElementById(stat.id);
            if (!element) return;
            
            let increment = stat.target / 60;
            if (stat.isFloat) {
                increment = stat.target / 60;
            }
            
            let count = 0;
            const updateCount = () => {
                count += increment;
                if (count >= stat.target) {
                    element.textContent = stat.target + stat.suffix;
                } else {
                    element.textContent = (stat.isFloat ? count.toFixed(1) : Math.floor(count)) + stat.suffix;
                    requestAnimationFrame(updateCount);
                }
            };
            updateCount();
        });
    };

    // Trigger stats animation when visible in viewport
    const statsBar = document.querySelector('.stats-bar');
    if (statsBar) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateStats();
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });
        
        observer.observe(statsBar);
    }

    // Mock Discord online member count
    const discordCount = document.getElementById('discord-count');
    if (discordCount) {
        // Simulating a real fetch with a dynamic online range
        const baseMembers = 1420;
        const randomActive = Math.floor(Math.random() * 80) + 10;
        discordCount.textContent = `${baseMembers + randomActive} Online`;
    }
});
