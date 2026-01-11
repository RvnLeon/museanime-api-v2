const axios = require("axios")

const Service = {
    fetchService: async (url, res) => {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
                }
            });
            return new Promise((resolve, reject) => {
                if (response.status === 200) resolve(response)
                reject(response)
            })
        } catch (error) {
            res.send({
                status: false,
                code: 404,
                message: "Bad Request"
            })
            throw error
        }
    }
}

module.exports = Service