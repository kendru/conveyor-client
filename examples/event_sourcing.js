const { Client, Model, Repository } = require('../lib/index');

class User extends Model {

    introduce() {
        return `Hi, my name is ${this.name}, and I am ${this.age} years old`;
    }
    
    setName(name) {
        this.emit({ type: 'nameSet', name });
    }

    setAge(age) {
        this.emit({ type: 'ageSet', age });
    }

    getOlder() {
        this.emit({ type: 'gotOlder' });
    }

    handle(event) {
        const { type } = event;

        switch(type) {
        case 'created':
            this.id = event.id;
            break;
        case 'nameSet':
            this.name = event.name;
            break;
        case 'ageSet':
            this.age = event.age;
            break;
        case 'gotOlder':
            this.age = (this.age || 0) + 1;
            break;
        }
    }
}

const c = Client('localhost', 3000, false);
const userRepo = new Repository(c, 'User', '/test9/users', User);

(async () => {
    const userId = 1;
    const user = new User(userId);

    user.setName('Bobby');
    user.setAge(25);

    await userRepo.save(user);
    
    console.log(user.introduce());

    user.getOlder(); // User not saved after this
    console.log(user.introduce());

    const fetchedUser = await userRepo.fetch(userId);
    console.log(fetchedUser.introduce());
})();
